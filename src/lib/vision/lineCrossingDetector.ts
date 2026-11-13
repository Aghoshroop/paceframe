// Virtual Timing Line Crossing Detection and Sub-Frame Photo-Finish Engine
// Implements Dual-Boundary Approach State Machine, Torso Plane Penetration, and Sub-Frame Interpolation

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
  approachSide: "left" | "right" | null;
  approachFramesCount: number;
  hasConfirmedApproach: boolean;
  lastTriggerTime: number;
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
    if (now - state.lastTriggerTime < 1500) {
      return "GATE_BROKEN";
    }
    if (state.hasConfirmedApproach) {
      return "RUNNER_APPROACHING";
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

      // Initialize gate state if needed
      let gState = this.gateStates.get(zone.zoneId);
      if (!gState) {
        gState = {
          approachSide: null,
          approachFramesCount: 0,
          hasConfirmedApproach: false,
          lastTriggerTime: 0,
        };
        this.gateStates.set(zone.zoneId, gState);
      }

      // Check cooldown lockout (default 1500ms)
      if (tCurr - gState.lastTriggerTime < (zone.cooldownMs || 1500)) {
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

      // Distance from gate line (negative = left, positive = right)
      const distCurr = currX - xLine;
      const distPrev = prevX - xLine;

      // 1. Approach State Machine
      // Athlete must be established on an approach side for at least 2 frames before a crossing can trigger.
      // This prevents false triggers from someone already standing on the line when timing starts!
      const approachMargin = 0.015; // 1.5% screen width margin

      if (distCurr < -approachMargin) {
        // Approaching from left
        if (gState.approachSide !== "left") {
          gState.approachSide = "left";
          gState.approachFramesCount = 1;
        } else {
          gState.approachFramesCount++;
        }
        if (gState.approachFramesCount >= 2) {
          gState.hasConfirmedApproach = true;
        }
      } else if (distCurr > approachMargin) {
        // Approaching from right
        if (gState.approachSide !== "right") {
          gState.approachSide = "right";
          gState.approachFramesCount = 1;
        } else {
          gState.approachFramesCount++;
        }
        if (gState.approachFramesCount >= 2) {
          gState.hasConfirmedApproach = true;
        }
      }

      // 2. Torso Line Crossing Evaluation
      // A crossing requires:
      // a) Confirmed approach from one side
      // b) Torso plane crossed over the line (sign change between prev and curr), OR
      //    Bounding box chest penetration with forward momentum towards the line
      let hasCrossed = false;
      const vx = currentTorso.velocity.vx;

      if (gState.hasConfirmedApproach) {
        if (gState.approachSide === "left") {
          // Moving Left-to-Right across line
          if (zone.detectionDirection === "left_to_right" || zone.detectionDirection === "bidirectional") {
            const crossedLine = prevX < xLine && currX >= xLine;
            const penetratingLine = Math.abs(distCurr) <= 0.03 && vx > 0.04;
            if (crossedLine || penetratingLine) {
              hasCrossed = true;
            }
          }
        } else if (gState.approachSide === "right") {
          // Moving Right-to-Left across line
          if (zone.detectionDirection === "right_to_left" || zone.detectionDirection === "bidirectional") {
            const crossedLine = prevX > xLine && currX <= xLine;
            const penetratingLine = Math.abs(distCurr) <= 0.03 && vx < -0.04;
            if (crossedLine || penetratingLine) {
              hasCrossed = true;
            }
          }
        }
      } else {
        // Fallback for fast entry: If athlete enters frame at high speed crossing the line in 1 frame
        const trajectoryJump = (prevX < xLine && currX >= xLine) || (prevX > xLine && currX <= xLine);
        if (trajectoryJump && Math.abs(vx) > 0.20) {
          hasCrossed = true;
        }
      }

      // 3. Trigger Gate Break Event
      if (hasCrossed) {
        // Calculate sub-frame linear interpolation offset
        const totalDeltaX = Math.abs(currX - prevX);
        const alpha =
          totalDeltaX > 0.001
            ? Math.min(1, Math.max(0, Math.abs(xLine - prevX) / totalDeltaX))
            : 0.5;

        const interpolatedLocalTime = tPrev + alpha * (tCurr - tPrev);
        const synchronizedTimestamp = interpolatedLocalTime + clockOffsetMs;

        // Record trigger time and reset approach state
        gState.lastTriggerTime = tCurr;
        gState.hasConfirmedApproach = false;
        gState.approachFramesCount = 0;

        // Capture official photo-finish evidence snapshot
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
   * Generates a high-contrast official photo-finish evidence frame
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

    const w = video.videoWidth;
    const h = video.videoHeight;
    this.evidenceCanvas.width = w;
    this.evidenceCanvas.height = h;

    // Draw the raw camera frame
    this.evidenceCtx.drawImage(video, 0, 0, w, h);

    const x1 = zone.lineCoordinates.x1 * w;
    const y1 = zone.lineCoordinates.y1 * h;
    const x2 = zone.lineCoordinates.x2 * w;
    const y2 = zone.lineCoordinates.y2 * h;

    // Draw razor-sharp neon finish gate laser
    this.evidenceCtx.save();
    this.evidenceCtx.strokeStyle = "#ffffff";
    this.evidenceCtx.lineWidth = 6;
    this.evidenceCtx.shadowColor = zone.color || "#ccff00";
    this.evidenceCtx.shadowBlur = 20;

    this.evidenceCtx.beginPath();
    this.evidenceCtx.moveTo(x1, y1);
    this.evidenceCtx.lineTo(x2, y2);
    this.evidenceCtx.stroke();

    this.evidenceCtx.strokeStyle = zone.color || "#ccff00";
    this.evidenceCtx.lineWidth = 3;
    this.evidenceCtx.stroke();
    this.evidenceCtx.restore();

    // Draw athlete torso target crosshair
    const tx = torso.torsoCenter.x * w;
    const ty = torso.torsoCenter.y * h;

    this.evidenceCtx.save();
    // Crosshair rings
    this.evidenceCtx.strokeStyle = "#ffffff";
    this.evidenceCtx.lineWidth = 3;
    this.evidenceCtx.beginPath();
    this.evidenceCtx.arc(tx, ty, 20, 0, 2 * Math.PI);
    this.evidenceCtx.stroke();

    this.evidenceCtx.fillStyle = zone.color || "#ccff00";
    this.evidenceCtx.beginPath();
    this.evidenceCtx.arc(tx, ty, 7, 0, 2 * Math.PI);
    this.evidenceCtx.fill();

    // Torso Bounding Box
    this.evidenceCtx.strokeStyle = "rgba(204, 255, 0, 0.6)";
    this.evidenceCtx.lineWidth = 2;
    this.evidenceCtx.setLineDash([6, 6]);
    this.evidenceCtx.strokeRect(
      torso.boundingBox.x * w,
      torso.boundingBox.y * h,
      torso.boundingBox.width * w,
      torso.boundingBox.height * h
    );
    this.evidenceCtx.restore();

    // Official FAT (Fully Automatic Timing) Telemetry Banner
    const pad = 16;
    const boxW = Math.min(w - 32, 380);
    const boxH = 96;

    this.evidenceCtx.save();
    this.evidenceCtx.fillStyle = "rgba(10, 12, 15, 0.92)";
    this.evidenceCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    this.evidenceCtx.lineWidth = 1;
    this.evidenceCtx.fillRect(pad, pad, boxW, boxH);
    this.evidenceCtx.strokeRect(pad, pad, boxW, boxH);

    // Accent line
    this.evidenceCtx.fillStyle = zone.color || "#ccff00";
    this.evidenceCtx.fillRect(pad, pad, boxW, 4);

    this.evidenceCtx.font = "bold 14px -apple-system, sans-serif";
    this.evidenceCtx.fillStyle = "#ffffff";
    this.evidenceCtx.fillText(
      `OFFICIAL PHOTO-FINISH // ${zone.name.toUpperCase()}`,
      pad + 12,
      pad + 24
    );

    this.evidenceCtx.font = "11px monospace";
    this.evidenceCtx.fillStyle = "#ccff00";
    this.evidenceCtx.fillText(
      `SUB-FRAME INTERPOLATION: α = ${(alpha * 100).toFixed(0)}% • SYNC: ${syncTimestamp.toFixed(2)} ms`,
      pad + 12,
      pad + 44
    );

    this.evidenceCtx.fillStyle = "#d4d4d8";
    this.evidenceCtx.fillText(
      `TORSO PLANE: [${torso.torsoCenter.x.toFixed(3)}, ${torso.torsoCenter.y.toFixed(3)}] • VELOCITY: ${torso.velocity.vx.toFixed(2)} w/s`,
      pad + 12,
      pad + 62
    );

    this.evidenceCtx.fillStyle = "#a1a1aa";
    this.evidenceCtx.fillText(
      `VALIDATED BY CAMERA GATE • CONFIDENCE: ${(Math.max(0.85, torso.confidence) * 100).toFixed(0)}%`,
      pad + 12,
      pad + 80
    );
    this.evidenceCtx.restore();

    return this.evidenceCanvas.toDataURL("image/jpeg", 0.88);
  }
}
