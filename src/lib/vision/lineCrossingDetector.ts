// Virtual Timing Line Crossing Detection and Sub-Frame Photo-Finish Engine
// Implements Instant Torso Plane Penetration, Robust Boundary Crossing, and Sub-Frame Linear Interpolation

import { DetectionZone, TimingEvent, TimingEventType } from "@/types";
import { TorsoLandmarkData } from "./torsoTracker";

export interface CrossingResult {
  zone: DetectionZone;
  event: TimingEvent;
  interpolatedTimestamp: number;
  frameSnapshot: string;
}

export type GateDetectionState =
  | "WAITING_FOR_APPROACH"
  | "RUNNER_APPROACHING"
  | "GATE_BROKEN"
  | "COOLDOWN";

interface GateStateData {
  lastTriggerTime: number;
  lastSide: "left" | "right" | "on_line";
}

export class LineCrossingDetector {
  private gateStates: Map<string, GateStateData> = new Map();
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
   * Resets all gate states and cooldowns for a new sprint attempt
   */
  public reset() {
    this.gateStates.clear();
    this.prevTorso = null;
  }

  /**
   * Get the current gate tracking status for UI telemetry
   */
  public getGateStatus(zoneId: string): GateDetectionState {
    const state = this.gateStates.get(zoneId);
    if (!state) return "WAITING_FOR_APPROACH";

    const now = performance.now();
    if (now - state.lastTriggerTime < 1200) {
      return "GATE_BROKEN";
    }
    return "WAITING_FOR_APPROACH";
  }

  /**
   * Evaluates if the current torso crossed or penetrated any configured detection gate
   */
  public evaluate(
    currentTorso: TorsoLandmarkData,
    zones: DetectionZone[],
    videoElement: HTMLVideoElement,
    sessionId: string,
    deviceId: string,
    deviceName: string,
    clockOffsetMs: number = 0,
    isTimingRunning: boolean = true
  ): CrossingResult[] {
    const results: CrossingResult[] = [];
    const tCurr = currentTorso.timestamp;
    const pCurr = currentTorso.torsoCenter;
    const pPrev = this.prevTorso ? this.prevTorso.torsoCenter : pCurr;
    const tPrev = this.prevTorso ? this.prevTorso.timestamp : tCurr - 16.6;

    for (const zone of zones) {
      if (!zone.active) continue;

      let gState = this.gateStates.get(zone.zoneId);
      if (!gState) {
        gState = {
          lastTriggerTime: 0,
          lastSide: "left",
        };
        this.gateStates.set(zone.zoneId, gState);
      }

      // Check cooldown lockout (default 1000ms cooldown)
      if (tCurr - gState.lastTriggerTime < (zone.cooldownMs || 1000)) {
        continue;
      }

      // Vertical gate bounds check (gate vertical aperture)
      const minY = Math.min(zone.lineCoordinates.y1, zone.lineCoordinates.y2) - 0.25;
      const maxY = Math.max(zone.lineCoordinates.y1, zone.lineCoordinates.y2) + 0.25;
      if (pCurr.y < minY || pCurr.y > maxY) {
        continue;
      }

      // Virtual Gate X coordinate
      const xLine = (zone.lineCoordinates.x1 + zone.lineCoordinates.x2) / 2;
      const currX = pCurr.x;
      const prevX = pPrev.x;

      // Distance from line (negative = left, positive = right)
      const distCurr = currX - xLine;
      const distPrev = prevX - xLine;

      const currentSide: "left" | "right" | "on_line" =
        distCurr < -0.01 ? "left" : distCurr > 0.01 ? "right" : "on_line";

      // 1. Direct Line Crossing / Penetration Check:
      // a) Trajectory sign change: was on left, now on right (or vice versa)
      const crossedLineLeftToRight = prevX <= xLine && currX >= xLine;
      const crossedLineRightToLeft = prevX >= xLine && currX <= xLine;

      // b) Torso bounding box penetrates the virtual line while moving
      const bbLeft = currentTorso.boundingBox.x;
      const bbRight = currentTorso.boundingBox.x + currentTorso.boundingBox.width;
      const bbIntersectsLine = bbLeft <= xLine && bbRight >= xLine;

      // c) Side transition from previous frame
      const sideTransition =
        (gState.lastSide === "left" && currentSide === "right") ||
        (gState.lastSide === "right" && currentSide === "left") ||
        (gState.lastSide !== "on_line" && currentSide === "on_line");

      let hasCrossed = false;

      if (zone.detectionDirection === "left_to_right") {
        hasCrossed = crossedLineLeftToRight || (bbIntersectsLine && currentTorso.velocity.vx > 0.02);
      } else if (zone.detectionDirection === "right_to_left") {
        hasCrossed = crossedLineRightToLeft || (bbIntersectsLine && currentTorso.velocity.vx < -0.02);
      } else {
        // Bidirectional: any crossing or bounding box penetration
        hasCrossed =
          crossedLineLeftToRight ||
          crossedLineRightToLeft ||
          sideTransition ||
          (bbIntersectsLine && Math.abs(currentTorso.velocity.vx) >= 0.01);
      }

      gState.lastSide = currentSide;

      // 2. Trigger Gate Break Event
      if (hasCrossed) {
        // Calculate sub-frame linear interpolation offset
        const totalDeltaX = Math.abs(currX - prevX);
        const alpha =
          totalDeltaX > 0.001
            ? Math.min(1, Math.max(0, Math.abs(xLine - prevX) / totalDeltaX))
            : 0.5;

        const interpolatedLocalTime = tPrev + alpha * (tCurr - tPrev);
        const synchronizedTimestamp = interpolatedLocalTime + clockOffsetMs;

        // Record trigger time
        gState.lastTriggerTime = tCurr;

        // Capture lightweight photo-finish evidence snapshot (fast 480px JPEG)
        const snapshot = this.captureEvidenceFrame(
          videoElement,
          zone,
          currentTorso,
          synchronizedTimestamp,
          alpha
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
          confidence: Math.max(0.85, currentTorso.confidence),
          detectionZoneId: zone.zoneId,
          frameReference: snapshot,
          torsoPosition: {
            x: Math.round(currentTorso.torsoCenter.x * 1000) / 1000,
            y: Math.round(currentTorso.torsoCenter.y * 1000) / 1000,
            vx: Math.round(currentTorso.velocity.vx * 100) / 100,
            vy: Math.round(currentTorso.velocity.vy * 100) / 100,
          },
          notes: `${zone.name} crossed by torso (sub-frame α=${alpha.toFixed(2)})`,
        };

        results.push({
          zone,
          event,
          interpolatedTimestamp: synchronizedTimestamp,
          frameSnapshot: snapshot,
        });
      }
    }

    this.prevTorso = currentTorso;
    return results;
  }

  /**
   * Generates a lightweight, high-contrast photo-finish evidence frame
   * Scaled to 480px width so base64 string is only ~12KB for instant network transmission
   */
  private captureEvidenceFrame(
    video: HTMLVideoElement,
    zone: DetectionZone,
    torso: TorsoLandmarkData,
    syncTimestamp: number,
    alpha: number
  ): string {
    if (!this.evidenceCanvas || !this.evidenceCtx || !video.videoWidth) {
      return "";
    }

    // Fast lightweight resolution: 480px width (preserves 16:9 aspect ratio)
    const targetW = 480;
    const aspect = video.videoHeight / video.videoWidth || 9 / 16;
    const targetH = Math.round(targetW * aspect);

    this.evidenceCanvas.width = targetW;
    this.evidenceCanvas.height = targetH;

    // 1. Draw raw video frame scaled down
    this.evidenceCtx.drawImage(video, 0, 0, targetW, targetH);

    const x1 = zone.lineCoordinates.x1 * targetW;
    const y1 = zone.lineCoordinates.y1 * targetH;
    const x2 = zone.lineCoordinates.x2 * targetW;
    const y2 = zone.lineCoordinates.y2 * targetH;

    // 2. Draw neon finish laser line
    this.evidenceCtx.save();
    this.evidenceCtx.strokeStyle = "#ffffff";
    this.evidenceCtx.lineWidth = 4;
    this.evidenceCtx.shadowColor = zone.color || "#ccff00";
    this.evidenceCtx.shadowBlur = 12;

    this.evidenceCtx.beginPath();
    this.evidenceCtx.moveTo(x1, y1);
    this.evidenceCtx.lineTo(x2, y2);
    this.evidenceCtx.stroke();

    this.evidenceCtx.strokeStyle = zone.color || "#ccff00";
    this.evidenceCtx.lineWidth = 2;
    this.evidenceCtx.stroke();
    this.evidenceCtx.restore();

    // 3. Draw torso target reticle
    const tx = torso.torsoCenter.x * targetW;
    const ty = torso.torsoCenter.y * targetH;

    this.evidenceCtx.save();
    this.evidenceCtx.strokeStyle = "#ffffff";
    this.evidenceCtx.lineWidth = 2;
    this.evidenceCtx.beginPath();
    this.evidenceCtx.arc(tx, ty, 12, 0, 2 * Math.PI);
    this.evidenceCtx.stroke();

    this.evidenceCtx.fillStyle = zone.color || "#ccff00";
    this.evidenceCtx.beginPath();
    this.evidenceCtx.arc(tx, ty, 4, 0, 2 * Math.PI);
    this.evidenceCtx.fill();

    // Torso Bounding Box
    this.evidenceCtx.strokeStyle = "rgba(204, 255, 0, 0.7)";
    this.evidenceCtx.lineWidth = 1.5;
    this.evidenceCtx.setLineDash([4, 4]);
    this.evidenceCtx.strokeRect(
      torso.boundingBox.x * targetW,
      torso.boundingBox.y * targetH,
      torso.boundingBox.width * targetW,
      torso.boundingBox.height * targetH
    );
    this.evidenceCtx.restore();

    // 4. Official FAT Telemetry Overlay Badge
    this.evidenceCtx.save();
    this.evidenceCtx.fillStyle = "rgba(10, 12, 15, 0.90)";
    this.evidenceCtx.fillRect(8, 8, 220, 46);
    this.evidenceCtx.strokeStyle = "#ccff00";
    this.evidenceCtx.lineWidth = 1;
    this.evidenceCtx.strokeRect(8, 8, 220, 46);

    this.evidenceCtx.font = "bold 10px monospace";
    this.evidenceCtx.fillStyle = "#ffffff";
    this.evidenceCtx.fillText(`PHOTO-FINISH // ${zone.name.toUpperCase()}`, 14, 22);

    this.evidenceCtx.fillStyle = "#ccff00";
    this.evidenceCtx.fillText(`SUB-FRAME α=${(alpha * 100).toFixed(0)}%`, 14, 34);

    this.evidenceCtx.fillStyle = "#a1a1aa";
    this.evidenceCtx.fillText(`TORSO CONF: ${(torso.confidence * 100).toFixed(0)}%`, 14, 46);
    this.evidenceCtx.restore();

    // High compression JPEG (only ~12KB string!)
    return this.evidenceCanvas.toDataURL("image/jpeg", 0.65);
  }
}
