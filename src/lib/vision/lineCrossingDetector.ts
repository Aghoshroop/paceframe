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

  /**
   * Reset tracking state
   */
  public reset() {
    this.lastCrossingTimes.clear();
    this.prevTorso = null;
  }

  /**
   * Evaluates if the current torso crossed any configured detection line
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
    if (!this.prevTorso) {
      this.prevTorso = currentTorso;
      return results;
    }

    const tPrev = this.prevTorso.timestamp;
    const tCurr = currentTorso.timestamp;
    const pPrev = this.prevTorso.torsoCenter;
    const pCurr = currentTorso.torsoCenter;

    for (const zone of zones) {
      if (!zone.active) continue;

      // Check cooldown
      const lastTrigger = this.lastCrossingTimes.get(zone.zoneId) || 0;
      if (tCurr - lastTrigger < zone.cooldownMs) {
        continue;
      }

      // Check confidence threshold
      if (currentTorso.confidence < zone.confidenceThreshold) {
        continue;
      }

      // Check vertical boundary
      const minY = Math.min(zone.lineCoordinates.y1, zone.lineCoordinates.y2) - 0.15;
      const maxY = Math.max(zone.lineCoordinates.y1, zone.lineCoordinates.y2) + 0.15;
      if (pCurr.y < minY || pCurr.y > maxY) {
        continue;
      }

      // 2D Line crossing test using signed cross-products
      const x1 = zone.lineCoordinates.x1;
      const y1 = zone.lineCoordinates.y1;
      const x2 = zone.lineCoordinates.x2;
      const y2 = zone.lineCoordinates.y2;

      // Signed cross product (point relative to directed line segment)
      const dPrev = (pPrev.x - x1) * (y2 - y1) - (pPrev.y - y1) * (x2 - x1);
      const dCurr = (pCurr.x - x1) * (y2 - y1) - (pCurr.y - y1) * (x2 - x1);

      // A crossing occurred if signs differ (one side to the other)
      const crossed = (dPrev < 0 && dCurr >= 0) || (dPrev > 0 && dCurr <= 0);

      if (crossed) {
        // Validate crossing direction
        let validDirection = false;
        const movingLeftToRight = pCurr.x > pPrev.x;

        if (zone.detectionDirection === "bidirectional") {
          validDirection = true;
        } else if (zone.detectionDirection === "left_to_right" && movingLeftToRight) {
          validDirection = true;
        } else if (zone.detectionDirection === "right_to_left" && !movingLeftToRight) {
          validDirection = true;
        }

        if (validDirection) {
          // Sub-frame linear interpolation
          const denom = Math.abs(dPrev) + Math.abs(dCurr);
          const alpha = denom > 0 ? Math.abs(dPrev) / denom : 0.5;
          const interpolatedLocalTime = tPrev + alpha * (tCurr - tPrev);
          const synchronizedTimestamp = interpolatedLocalTime + clockOffsetMs;

          // Record cooldown
          this.lastCrossingTimes.set(zone.zoneId, tCurr);

          // Capture photo-finish frame with annotations
          const snapshot = this.captureEvidenceFrame(
            videoElement,
            zone,
            currentTorso,
            synchronizedTimestamp
          );

          // Map zoneType to TimingEventType
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
            confidence: currentTorso.confidence,
            detectionZoneId: zone.zoneId,
            frameReference: snapshot,
            torsoPosition: {
              x: Math.round(currentTorso.torsoCenter.x * 1000) / 1000,
              y: Math.round(currentTorso.torsoCenter.y * 1000) / 1000,
              vx: Math.round(currentTorso.velocity.vx * 100) / 100,
              vy: Math.round(currentTorso.velocity.vy * 100) / 100,
            },
            notes: `${zone.name} crossed (${zone.detectionDirection})`,
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

  /**
   * Overlays photo-finish telemetry directly onto the captured frame
   */
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

    // 1. Draw raw video frame
    this.evidenceCtx.drawImage(video, 0, 0, w, h);

    // 2. Draw virtual timing line
    const x1 = zone.lineCoordinates.x1 * w;
    const y1 = zone.lineCoordinates.y1 * h;
    const x2 = zone.lineCoordinates.x2 * w;
    const y2 = zone.lineCoordinates.y2 * h;

    this.evidenceCtx.save();
    this.evidenceCtx.strokeStyle = zone.color || "#ccff00";
    this.evidenceCtx.lineWidth = 4;
    this.evidenceCtx.shadowColor = zone.color || "#ccff00";
    this.evidenceCtx.shadowBlur = 10;

    this.evidenceCtx.beginPath();
    this.evidenceCtx.moveTo(x1, y1);
    this.evidenceCtx.lineTo(x2, y2);
    this.evidenceCtx.stroke();
    this.evidenceCtx.restore();

    // 3. Draw athlete torso tracking point
    const tx = torso.torsoCenter.x * w;
    const ty = torso.torsoCenter.y * h;

    this.evidenceCtx.save();
    // Torso outer reticle
    this.evidenceCtx.strokeStyle = "#ffffff";
    this.evidenceCtx.lineWidth = 2;
    this.evidenceCtx.beginPath();
    this.evidenceCtx.arc(tx, ty, 14, 0, 2 * Math.PI);
    this.evidenceCtx.stroke();

    // Torso inner core
    this.evidenceCtx.fillStyle = zone.color || "#ccff00";
    this.evidenceCtx.beginPath();
    this.evidenceCtx.arc(tx, ty, 6, 0, 2 * Math.PI);
    this.evidenceCtx.fill();

    // Bounding box (subtle dashed)
    this.evidenceCtx.strokeStyle = "rgba(204, 255, 0, 0.4)";
    this.evidenceCtx.lineWidth = 1.5;
    this.evidenceCtx.setLineDash([4, 4]);
    this.evidenceCtx.strokeRect(
      torso.boundingBox.x * w,
      torso.boundingBox.y * h,
      torso.boundingBox.width * w,
      torso.boundingBox.height * h
    );
    this.evidenceCtx.restore();

    // 4. Draw professional photo-finish telemetry HUD overlay
    const pad = 16;
    const boxW = 340;
    const boxH = 92;

    this.evidenceCtx.fillStyle = "rgba(10, 12, 15, 0.85)";
    this.evidenceCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    this.evidenceCtx.lineWidth = 1;
    this.evidenceCtx.fillRect(pad, pad, boxW, boxH);
    this.evidenceCtx.strokeRect(pad, pad, boxW, boxH);

    // Accent header bar
    this.evidenceCtx.fillStyle = zone.color || "#ccff00";
    this.evidenceCtx.fillRect(pad, pad, boxW, 4);

    // Text info
    this.evidenceCtx.font = "bold 15px -apple-system, sans-serif";
    this.evidenceCtx.fillStyle = "#ffffff";
    this.evidenceCtx.fillText(
      `PACEFRAME PHOTO-FINISH // ${zone.name.toUpperCase()}`,
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
      `CONFIDENCE: ${(torso.confidence * 100).toFixed(0)}%  |  ${torso.isPoseModel ? "POSE LANDMARK" : "MOTION CENTROID"}`,
      pad + 12,
      pad + 80
    );

    return this.evidenceCanvas.toDataURL("image/jpeg", 0.85);
  }
}

