// PACEFRAME Core Data Types & Models

export type DeviceRole =
  | "master_console"
  | "start_camera"
  | "finish_camera"
  | "split_camera"
  | "lap_camera"
  | "secondary_camera";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "synchronizing"
  | "ready"
  | "recording"
  | "reconnecting";

export type StartMethod = "hold_and_release" | "camera_automatic";

export type SessionStatus =
  | "idle"
  | "armed"
  | "running"
  | "split_detected"
  | "finished"
  | "error";

export type TimingEventType = "START" | "SPLIT" | "LAP" | "FINISH";

export type CrossingDirection = "left_to_right" | "right_to_left" | "bidirectional";

export type TimingQuality =
  | "validated_camera"
  | "high_confidence"
  | "provisional"
  | "manual_override";

export interface Athlete {
  athleteId: string;
  name: string;
  teamId?: string;
  bibNumber?: string;
  category?: string;
  pb100m?: string;
  notes?: string;
  avatarUrl?: string;
}

export interface DetectionZone {
  zoneId: string;
  deviceId: string;
  zoneType: "start" | "finish" | "split" | "lap";
  name: string;
  // Normalized 0.0 to 1.0 coordinates
  lineCoordinates: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  detectionDirection: CrossingDirection;
  confidenceThreshold: number; // 0.0 - 1.0
  cooldownMs: number; // cooldown after trigger
  color: string;
  active: boolean;
}

export interface CameraSettings {
  deviceId?: string;
  label?: string;
  facingMode: "environment" | "user";
  width: number;
  height: number;
  frameRate: number;
}

export interface HardwareMetrics {
  cameraFps: number;
  processingFps: number;
  droppedFrames: number;
  frameLatencyMs: number;
  resolution: { width: number; height: number };
}

export interface SyncQuality {
  rttMs: number;
  clockOffsetMs: number;
  jitterMs: number;
  samplesCount: number;
  quality: "excellent" | "good" | "fair" | "uncalibrated";
}

export interface ConnectedDevice {
  deviceId: string;
  sessionId: string;
  deviceName: string;
  deviceRole: DeviceRole;
  connectionStatus: ConnectionStatus;
  isAuthority: boolean;
  cameraSettings?: CameraSettings;
  hardwareMetrics?: HardwareMetrics;
  syncQuality: SyncQuality;
  lastHeartbeat: number;
}

export interface TimingEvent {
  eventId: string;
  sessionId: string;
  deviceId: string;
  deviceName?: string;
  eventType: TimingEventType;
  localTimestamp: number; // performance.now() on generating device
  synchronizedTimestamp: number; // local + clockOffset
  confidence: number;
  frameReference?: string; // Data URL of the freeze frame snapshot
  splitIndex?: number;
  lapNumber?: number;
  detectionZoneId?: string;
  torsoPosition?: {
    x: number; // 0.0 - 1.0
    y: number; // 0.0 - 1.0
    vx?: number;
    vy?: number;
  };
  notes?: string;
}

export interface SplitRecord {
  index: number;
  name: string;
  splitTimeMs: number; // time since previous split or start
  elapsedMs: number; // cumulative time from start
  speedKmh?: number;
  speedMs?: number;
  distanceMeters?: number;
  frameReference?: string;
  confidence: number;
}

export interface LapRecord {
  lapNumber: number;
  lapTimeMs: number;
  cumulativeMs: number;
  frameReference?: string;
}

export interface TimingResult {
  resultId: string;
  sessionId: string;
  athleteId: string;
  athleteName: string;
  eventName: string;
  distanceMeters?: number;
  isFlyingStart: boolean;
  startMethod: StartMethod;
  startTime: number;
  finishTime: number;
  totalTimeMs: number;
  splitTimes: SplitRecord[];
  lapTimes: LapRecord[];
  timingQuality: TimingQuality;
  uncertaintyMs: number;
  syncQuality: SyncQuality;
  hardwareMetrics: HardwareMetrics;
  recordedAt: number; // Epoch timestamp
  videoEvidence?: {
    startFrame?: string;
    finishFrame?: string;
    splitFrames?: { [key: number]: string };
  };
}

export interface Session {
  sessionId: string;
  sessionName: string;
  athleteId: string;
  athleteName: string;
  eventName: string;
  distanceMeters?: number;
  isFlyingStart: boolean;
  flyingDistanceMeters?: number;
  startMethod: StartMethod;
  sessionStatus: SessionStatus;
  targetLaps?: number; // 0 for sprint, >0 for lap counting
  zones: DetectionZone[];
  devices: ConnectedDevice[];
  createdAt: number;
  notes?: string;
}

// Network P2P Messages
export type NetworkMessageType =
  | "JOIN_REQUEST"
  | "JOIN_ACCEPTED"
  | "ROLE_ASSIGNMENT"
  | "ZONE_UPDATE"
  | "CLOCK_PING"
  | "CLOCK_PONG"
  | "TIMING_EVENT"
  | "SESSION_UPDATE"
  | "HEARTBEAT"
  | "MANUAL_TRIGGER";

export interface NetworkMessage {
  id: string;
  type: NetworkMessageType;
  sessionId: string;
  senderDeviceId: string;
  senderName: string;
  timestamp: number; // sender's performance.now()
  payload: any;
}

