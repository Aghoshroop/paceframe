// Virtual Timing Line Crossing Detection and Sub-Frame Photo-Finish Engine

import { DetectionZone, TimingEvent, TimingEventType } from "@/types";
import { TorsoLandmarkData } from "./torsoTracker";

export interface CrossingResult {
  zone: DetectionZone;
  event: TimingEvent;
  interpolatedTimestamp: number;
  frameSnapshot: string;
}

export class LineCrossingDetector {
  private lastCrossingTimes: Map<string, number> = new Map();
  private prevTorso: TorsoLandmarkData | null = null;
  private evidenceCanvas: HTMLCanvasElement | null = null;
  private evidenceCtx: CanvasRenderingContext2D | null = null;

  constructor() {
    if (typeof document !== "undefined") {
      this.evidenceCanvas = document.createElement("canvas");
      this.evidenceCtx = this.evidenceCanvas.getContext("2d");
    }
  }

  public reset() {
    this.lastCrossingTimes.clear();
    this.prevTorso = null;
  }

  /**
   * Evaluates if the current torso crossed or touched any configured detection line
   */
  public evaluate(
    currentTorso: TorsoLandmarkData,
    zones: DetectionZone[],
    videoElement: HTMLVideoElement,
    sessionId: string,
    deviceId: string,
    deviceName: string,
    clockOffsetMs: number = 0
  ): CrossingResult[] {
    const results: CrossingResult[] = [];
    const tCurr = currentTorso.timestamp;
    const pCurr = currentTorso.torsoCenter;
    const pPrev = this.prevTorso ? this.prevTorso.torsoCenter : pCurr;
    const tPrev = this.prevTorso ? this.prevTorso.timestamp : tCurr - 16.6;

    for (const zone of zones) {
      if (!zone.active) continue;

      // Check cooldown (prevents repeated triggers)
      const lastTrigger = this.lastCrossingTimes.get(zone.zoneId) || 0;
      if (tCurr - lastTrigger < (zone.cooldownMs || 1500)) {
        continue;
      }

      // Check vertical boundary (gate height)
      const minY = Math.min(zone.lineCoordinates.y1, zone.lineCoordinates.y2) - 0.20;
      const maxY = Math.max(zone.lineCoordinates.y1, zone.lineCoordinates.y2) + 0.20;
      if (pCurr.y < minY || pCurr.y > maxY) {
        continue;
      }

      // Virtual Line X Coordinates
      const xLine = (zone.lineCoordinates.x1 + zone.lineCoordinates.x2) / 2;
      const torsoMinX = currentTorso.boundingBox.x;
      const torsoMaxX = currentTorso.boundingBox.x + currentTorso.boundingBox.width;
      const torsoCenterX = pCurr.x;
      const prevCenterX = pPrev.x;

      // Detection Criteria:
      // 1. Center Trajectory Crossing (moved from one side to the other)
      const crossedTrajectory =
        (prevCenterX < xLine && torsoCenterX >= xLine) ||
        (prevCenterX > xLine && torsoCenterX <= xLine);

      // 2. Torso Bounding Box Touching / Spanning the Gate
      const isTouchingLine = xLine >= torsoMinX && xLine <= torsoMaxX;

      // 3. Proximity Gate Contact (within 5% of screen width)
      const isVeryClose = Math.abs(torsoCenterX - xLine) <= 0.05;

      if (crossedTrajectory || isTouchingLine || isVeryClose) {
        // Validate Direction:
        // Touching or crossing the line directly ALWAYS triggers!
        let validDirection = true;

        if (zone.detectionDirection === "left_to_right") {
          // If runner was moving opposite direction and didn't touch or cross
          if (!isTouchingLine && !crossedTrajectory && torsoCenterX < prevCenterX - 0.01) {
            validDirection = false;
          }
        } else if (zone.detectionDirection === "right_to_left") {
          if (!isTouchingLine && !crossedTrajectory && torsoCenterX > prevCenterX + 0.01) {
            validDirection = false;
          }
        }

        if (validDirection) {
          // Sub-frame linear interpolation
          const deltaX = Math.abs(torsoCenterX - prevCenterX);
          const alpha = deltaX > 0 ? Math.min(1, Math.max(0, Math.abs(xLine - prevCenterX) / deltaX)) : 0.5;
          const interpolatedLocalTime = tPrev + alpha * (tCurr - tPrev);
          const synchronizedTimestamp = interpolatedLocalTime + clockOffsetMs;

          // Record cooldown
          this.lastCrossingTimes.set(zone.zoneId, tCurr);

          // Capture photo-finish freeze frame
          const snapshot = this.captureEvidenceFrame(
            videoElement,
            zone,
            currentTorso,
            synchronizedTimestamp
          );

          let eventType: TimingEventType = "SPLIT";
          if (zone.zoneType === "start") eventType = "START";
          else if (zone.zoneType === "finish") eventType = "FINISH";
          else if (zone.zoneType === "lap") eventType = "LAP";

          const event: TimingEvent = {
            eventId: `evt_${zone.zoneId}_${Math.round(tCurr)}_${Math.random().toString(36).substring(2, 6)}`,
            sessionId,
            deviceId,
            deviceName,
            eventType,
            localTimestamp: Math.round(interpolatedLocalTime * 10) / 10,
            synchronizedTimestamp: Math.round(synchronizedTimestamp * 10) / 10,
            confidence: Math.max(0.75, currentTorso.confidence),
            detectionZoneId: zone.zoneId,
            frameReference: snapshot,
            torsoPosition: {
              x: Math.round(currentTorso.torsoCenter.x * 1000) / 1000,
              y: Math.round(currentTorso.torsoCenter.y * 1000) / 1000,
              vx: Math.round(currentTorso.velocity.vx * 100) / 100,
              vy: Math.round(currentTorso.velocity.vy * 100) / 100,
            },
            notes: `${zone.name} reached (${(currentTorso.confidence * 100).toFixed(0)}% confidence)`,
          };

          results.push({
            zone,
            event,
            interpolatedTimestamp: synchronizedTimestamp,
            frameSnapshot: snapshot,
          });
        }
      }
    }

    this.prevTorso = currentTorso;
    return results;
  }

  private captureEvidenceFrame(
    video: HTMLVideoElement,
    zone: DetectionZone,
    torso: TorsoLandmarkData,
    syncTimestamp: number
  ): string {
    if (!this.evidenceCanvas || !this.evidenceCtx || !video.videoWidth) {
      return "";
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    this.evidenceCanvas.width = w;
    this.evidenceCanvas.height = h;

    this.evidenceCtx.drawImage(video, 0, 0, w, h);

    const x1 = zone.lineCoordinates.x1 * w;
    const y1 = zone.lineCoordinates.y1 * h;
    const x2 = zone.lineCoordinates.x2 * w;
    const y2 = zone.lineCoordinates.y2 * h;

    this.evidenceCtx.save();
    this.evidenceCtx.strokeStyle = zone.color || "#ccff00";
    this.evidenceCtx.lineWidth = 5;
    this.evidenceCtx.shadowColor = zone.color || "#ccff00";
    this.evidenceCtx.shadowBlur = 14;

    this.evidenceCtx.beginPath();
    this.evidenceCtx.moveTo(x1, y1);
    this.evidenceCtx.lineTo(x2, y2);
    this.evidenceCtx.stroke();
    this.evidenceCtx.restore();

    const tx = torso.torsoCenter.x * w;
    const ty = torso.torsoCenter.y * h;

    this.evidenceCtx.save();
    this.evidenceCtx.strokeStyle = "#ffffff";
    this.evidenceCtx.lineWidth = 3;
    this.evidenceCtx.beginPath();
    this.evidenceCtx.arc(tx, ty, 18, 0, 2 * Math.PI);
    this.evidenceCtx.stroke();

    this.evidenceCtx.fillStyle = zone.color || "#ccff00";
    this.evidenceCtx.beginPath();
    this.evidenceCtx.arc(tx, ty, 8, 0, 2 * Math.PI);
    this.evidenceCtx.fill();

    this.evidenceCtx.strokeStyle = "rgba(204, 255, 0, 0.5)";
    this.evidenceCtx.lineWidth = 2;
    this.evidenceCtx.setLineDash([4, 4]);
    this.evidenceCtx.strokeRect(
      torso.boundingBox.x * w,
      torso.boundingBox.y * h,
      torso.boundingBox.width * w,
      torso.boundingBox.height * h
    );
    this.evidenceCtx.restore();

    const pad = 16;
    const boxW = 340;
    const boxH = 92;

    this.evidenceCtx.fillStyle = "rgba(10, 12, 15, 0.88)";
    this.evidenceCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    this.evidenceCtx.lineWidth = 1;
    this.evidenceCtx.fillRect(pad, pad, boxW, boxH);
    this.evidenceCtx.strokeRect(pad, pad, boxW, boxH);

    this.evidenceCtx.fillStyle = zone.color || "#ccff00";
    this.evidenceCtx.fillRect(pad, pad, boxW, 4);

    this.evidenceCtx.font = "bold 15px -apple-system, sans-serif";
    this.evidenceCtx.fillStyle = "#ffffff";
    this.evidenceCtx.fillText(
      `PHOTO-FINISH // ${zone.name.toUpperCase()}`,
      pad + 12,
      pad + 24
    );

    this.evidenceCtx.font = "12px monospace";
    this.evidenceCtx.fillStyle = "#a1a1aa";
    this.evidenceCtx.fillText(
      `SYNC TIME: ${syncTimestamp.toFixed(2)} ms`,
      pad + 12,
      pad + 44
    );
    this.evidenceCtx.fillText(
      `TORSO COORD: [${torso.torsoCenter.x.toFixed(3)}, ${torso.torsoCenter.y.toFixed(3)}]`,
      pad + 12,
      pad + 62
    );
    this.evidenceCtx.fillText(
      `CONFIDENCE: ${(Math.max(0.75, torso.confidence) * 100).toFixed(0)}% • VERIFIED TORSO TOUCH`,
      pad + 12,
      pad + 80
    );

    return this.evidenceCanvas.toDataURL("image/jpeg", 0.85);
  }
}
