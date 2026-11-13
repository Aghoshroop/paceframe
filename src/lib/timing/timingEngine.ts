// PACEFRAME Authoritative Timing Engine
// Supports Sub-Millisecond Crossings, High-Precision Monotonic Epoch Sync, and Live Gate Beam Testing

import {
  Session,
  SessionStatus,
  TimingEvent,
  TimingResult,
  SplitRecord,
  LapRecord,
  TimingQuality,
  SyncQuality,
  HardwareMetrics,
} from "@/types";
import { soundEngine } from "@/lib/audio/soundEngine";
import { getPreciseTime } from "@/lib/timing/clockSync";

export interface TimingEngineListener {
  onStatusChange?: (status: SessionStatus) => void;
  onEventProcessed?: (event: TimingEvent) => void;
  onResultGenerated?: (result: TimingResult) => void;
  onGateTestTriggered?: (event: TimingEvent) => void;
}

export class TimingEngine {
  private session: Session;
  private status: SessionStatus = "idle";
  private startTime: number | null = null;
  private finishTime: number | null = null;
  private processedEvents: Map<string, TimingEvent> = new Map();
  private splits: SplitRecord[] = [];
  private laps: LapRecord[] = [];
  private currentLap: number = 0;
  private lastSplitTime: number = 0;
  private listeners: TimingEngineListener[] = [];
  private videoEvidence: {
    startFrame?: string;
    finishFrame?: string;
    splitFrames: { [key: number]: string };
  } = { splitFrames: {} };

  constructor(session: Session) {
    this.session = session;
  }

  public updateSession(session: Session) {
    this.session = session;
  }

  public subscribe(listener: TimingEngineListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyStatus(status: SessionStatus) {
    this.status = status;
    this.listeners.forEach((l) => l.onStatusChange?.(status));
  }

  public getStatus(): SessionStatus {
    return this.status;
  }

  public getStartTime(): number | null {
    return this.startTime;
  }

  public getSplits(): SplitRecord[] {
    return [...this.splits];
  }

  public getLaps(): LapRecord[] {
    return [...this.laps];
  }

  public getCurrentLap(): number {
    return this.currentLap;
  }

  public getProcessedEvents(): TimingEvent[] {
    return Array.from(this.processedEvents.values());
  }

  /**
   * Arm the session (e.g. Coach holding start button or system waiting for runner at start line)
   */
  public arm() {
    if (this.status === "running") return;
    this.notifyStatus("armed");
    soundEngine.playArmedTone();
  }

  /**
   * Cancel arming
   */
  public disarm() {
    if (this.status === "armed") {
      this.notifyStatus("idle");
    }
  }

  /**
   * Reset the engine for a new attempt
   */
  public reset() {
    this.status = "idle";
    this.startTime = null;
    this.finishTime = null;
    this.processedEvents.clear();
    this.splits = [];
    this.laps = [];
    this.currentLap = 0;
    this.lastSplitTime = 0;
    this.videoEvidence = { splitFrames: {} };
    this.notifyStatus("idle");
  }

  /**
   * Primary entry point for all timing events (local or remote via network)
   */
  public processEvent(
    event: TimingEvent,
    syncQuality?: SyncQuality,
    hardwareMetrics?: HardwareMetrics
  ): TimingResult | null {
    // Deduplicate event by eventId
    if (this.processedEvents.has(event.eventId)) {
      return null;
    }
    this.processedEvents.set(event.eventId, event);

    this.listeners.forEach((l) => l.onEventProcessed?.(event));

    switch (event.eventType) {
      case "START":
        return this.handleStartEvent(event);
      case "SPLIT":
        return this.handleSplitEvent(event);
      case "LAP":
        return this.handleLapEvent(event, syncQuality, hardwareMetrics);
      case "FINISH":
        return this.handleFinishEvent(event, syncQuality, hardwareMetrics);
      default:
        return null;
    }
  }

  private handleStartEvent(event: TimingEvent): null {
    if (this.status === "running") {
      return null;
    }

    this.startTime = event.synchronizedTimestamp;
    this.lastSplitTime = event.synchronizedTimestamp;
    this.currentLap = 1;
    this.splits = [];
    this.laps = [];

    if (event.frameReference) {
      this.videoEvidence.startFrame = event.frameReference;
    }

    this.notifyStatus("running");
    soundEngine.playStartHorn();
    return null;
  }

  private handleSplitEvent(event: TimingEvent): null {
    if (this.status !== "running" || this.startTime === null) {
      // Beam test while idle or armed
      this.listeners.forEach((l) => l.onGateTestTriggered?.(event));
      soundEngine.playSplitBeep();
      return null;
    }

    const nowEpoch = getPreciseTime();
    let splitSyncTime = event.synchronizedTimestamp;
    if (splitSyncTime <= this.lastSplitTime) {
      splitSyncTime = Math.max(this.lastSplitTime + 50, nowEpoch - 20);
    }

    const elapsedMs = Math.max(0, splitSyncTime - this.startTime);
    const splitTimeMs = Math.max(0, splitSyncTime - this.lastSplitTime);

    // Prevent immediate redundant split triggers (< 200ms)
    if (splitTimeMs < 200) {
      return null;
    }

    this.lastSplitTime = splitSyncTime;
    const splitIndex = this.splits.length + 1;

    let speedKmh: number | undefined;
    let speedMs: number | undefined;
    if (this.session.flyingDistanceMeters && this.session.flyingDistanceMeters > 0 && splitTimeMs > 0) {
      speedMs = (this.session.flyingDistanceMeters / (splitTimeMs / 1000));
      speedKmh = speedMs * 3.6;
    }

    const splitRecord: SplitRecord = {
      index: splitIndex,
      splitIndex,
      name: event.notes || `Split ${splitIndex}`,
      splitTimeMs: Math.round(splitTimeMs * 10) / 10,
      elapsedMs: Math.round(elapsedMs * 10) / 10,
      speedKmh: speedKmh ? Math.round(speedKmh * 10) / 10 : undefined,
      speedMs: speedMs ? Math.round(speedMs * 100) / 100 : undefined,
      frameReference: event.frameReference,
      confidence: event.confidence,
    };

    if (event.frameReference) {
      this.videoEvidence.splitFrames[splitIndex] = event.frameReference;
    }

    this.splits.push(splitRecord);
    this.notifyStatus("split_detected");
    soundEngine.playSplitBeep();

    setTimeout(() => {
      if (this.status === "split_detected") {
        this.notifyStatus("running");
      }
    }, 1200);

    return null;
  }

  private handleLapEvent(
    event: TimingEvent,
    syncQuality?: SyncQuality,
    hardwareMetrics?: HardwareMetrics
  ): TimingResult | null {
    if (this.status !== "running" || this.startTime === null) {
      return null;
    }

    const elapsedMs = Math.max(0, event.synchronizedTimestamp - this.startTime);
    const prevLapTime =
      this.laps.length > 0 ? this.laps[this.laps.length - 1].cumulativeMs : 0;
    const lapTimeMs = Math.max(0, elapsedMs - prevLapTime);

    if (lapTimeMs < 1500) {
      return null;
    }

    this.currentLap += 1;
    const lapNumber = this.laps.length + 1;

    const lapRecord: LapRecord = {
      lapNumber,
      lapTimeMs: Math.round(lapTimeMs * 10) / 10,
      cumulativeMs: Math.round(elapsedMs * 10) / 10,
      frameReference: event.frameReference,
    };

    this.laps.push(lapRecord);
    soundEngine.playSplitBeep();

    if (this.session.targetLaps && this.session.targetLaps > 0) {
      if (lapNumber >= this.session.targetLaps) {
        const finishEvent: TimingEvent = {
          ...event,
          eventType: "FINISH",
          eventId: `finish_by_lap_${event.eventId}`,
        };
        return this.handleFinishEvent(finishEvent, syncQuality, hardwareMetrics);
      }
    }

    return null;
  }

  private handleFinishEvent(
    event: TimingEvent,
    syncQuality?: SyncQuality,
    hardwareMetrics?: HardwareMetrics
  ): TimingResult | null {
    // If not running, athlete or coach broke the finish beam during testing
    if (this.status !== "running" || this.startTime === null) {
      this.listeners.forEach((l) => l.onGateTestTriggered?.(event));
      soundEngine.playSplitBeep();
      return null;
    }

    const nowEpoch = getPreciseTime();
    let finishTime = event.synchronizedTimestamp;
    let totalTimeMs = finishTime - this.startTime;

    // Check if clock skew between devices caused an improbable timestamp
    if (totalTimeMs < 50 || finishTime > nowEpoch + 1500) {
      // Fallback: Use authoritative Console arrival time minus transit delay (~20ms)
      finishTime = Math.max(this.startTime + 50, nowEpoch - 20);
      totalTimeMs = finishTime - this.startTime;
    }

    this.finishTime = finishTime;

    if (event.frameReference) {
      this.videoEvidence.finishFrame = event.frameReference;
    }

    this.notifyStatus("finished");
    soundEngine.playFinishChime();

    const defaultSync: SyncQuality = syncQuality || {
      rttMs: 0,
      clockOffsetMs: 0,
      jitterMs: 0.5,
      samplesCount: 5,
      quality: "excellent",
    };

    const defaultHw: HardwareMetrics = hardwareMetrics || {
      cameraFps: 60,
      processingFps: 60,
      droppedFrames: 0,
      frameLatencyMs: 16.6,
      resolution: { width: 1280, height: 720 },
    };

    const frameIntervalMs = 1000 / Math.max(15, defaultHw.cameraFps);
    const halfFrameUncertainty = frameIntervalMs / 2;
    const totalUncertainty = Math.round((defaultSync.jitterMs + halfFrameUncertainty * 2) * 10) / 10;

    let timingQuality: TimingQuality = "validated_camera";
    if (event.confidence < 0.6) {
      timingQuality = "provisional";
    } else if (defaultSync.quality === "uncalibrated") {
      timingQuality = "provisional";
    } else if (totalUncertainty <= 12) {
      timingQuality = "validated_camera";
    } else {
      timingQuality = "high_confidence";
    }

    let speedKmh: number | undefined;
    let speedMs: number | undefined;
    if (this.session.distanceMeters && this.session.distanceMeters > 0 && totalTimeMs > 0) {
      speedMs = Math.round((this.session.distanceMeters / (totalTimeMs / 1000)) * 100) / 100;
      speedKmh = Math.round(speedMs * 3.6 * 10) / 10;
    }

    const result: TimingResult = {
      resultId: `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId: this.session.sessionId,
      athleteId: this.session.athleteId,
      athleteName: this.session.athleteName,
      eventName: this.session.eventName,
      distanceMeters: this.session.distanceMeters,
      isFlyingStart: this.session.isFlyingStart,
      startMethod: this.session.startMethod,
      startTime: this.startTime,
      finishTime: this.finishTime,
      totalTimeMs: Math.round(totalTimeMs * 10) / 10,
      speedKmh,
      speedMs,
      splitTimes: [...this.splits],
      lapTimes: [...this.laps],
      timingQuality,
      uncertaintyMs: totalUncertainty,
      syncQuality: defaultSync,
      hardwareMetrics: defaultHw,
      recordedAt: Date.now(),
      videoEvidence: this.videoEvidence,
    };

    this.listeners.forEach((l) => l.onResultGenerated?.(result));
    return result;
  }

  /**
   * Manual override trigger (emergency stop or manual coach push)
   */
  public manualOverride(eventType: "START" | "SPLIT" | "FINISH", syncTime?: number): TimingResult | null {
    const timestamp = syncTime || getPreciseTime();
    const event: TimingEvent = {
      eventId: `man_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId: this.session.sessionId,
      deviceId: "manual_override_controller",
      deviceName: "Coach Console",
      eventType,
      localTimestamp: getPreciseTime(),
      synchronizedTimestamp: timestamp,
      confidence: 1.0,
      notes: "Manual Override Trigger",
    };

    return this.processEvent(event);
  }

  /**
   * Get current live elapsed milliseconds since start
   */
  public getLiveElapsedMs(nowSyncTime?: number): number {
    if (this.status !== "running" || this.startTime === null) {
      if (this.status === "finished" && this.startTime && this.finishTime) {
        return Math.max(0, this.finishTime - this.startTime);
      }
      return 0;
    }
    const now = nowSyncTime || getPreciseTime();
    return Math.max(0, now - this.startTime);
  }
}
