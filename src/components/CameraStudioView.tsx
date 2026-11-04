"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  Play,
  Sliders,
  Plus,
  Trash2,
  RefreshCw,
  MoveHorizontal,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  ShieldAlert,
  Zap,
  Activity,
  SwitchCamera,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { DetectionZone, HardwareMetrics, DeviceRole, TimingEvent } from "@/types";
import { CameraManager } from "@/lib/vision/cameraManager";
import { TorsoTracker, TorsoLandmarkData } from "@/lib/vision/torsoTracker";
import { LineCrossingDetector } from "@/lib/vision/lineCrossingDetector";

interface CameraStudioViewProps {
  zones: DetectionZone[];
  onUpdateZones: (zones: DetectionZone[]) => void;
  deviceRole: DeviceRole;
  sessionId: string;
  deviceId: string;
  deviceName: string;
  clockOffsetMs: number;
  onTimingEventDetected: (event: TimingEvent) => void;
  onOpenLiveConsole: () => void;
}

export const CameraStudioView: React.FC<CameraStudioViewProps> = ({
  zones,
  onUpdateZones,
  deviceRole,
  sessionId,
  deviceId,
  deviceName,
  clockOffsetMs,
  onTimingEventDetected,
  onOpenLiveConsole,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraManager] = useState(() => new CameraManager());
  const [torsoTracker] = useState(() => new TorsoTracker());
  const [lineDetector] = useState(() => new LineCrossingDetector());

  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [selectedZoneId, setSelectedZoneId] = useState<string>(zones[0]?.zoneId || "");
  const [isDraggingLine, setIsDraggingLine] = useState<boolean>(false);
  const [draggedZoneId, setDraggedZoneId] = useState<string | null>(null);

  const [usePoseModel, setUsePoseModel] = useState<boolean>(false);
  const [isPoseLoading, setIsPoseLoading] = useState<boolean>(false);
  const [showMobileControls, setShowMobileControls] = useState<boolean>(true);

  const [metrics, setMetrics] = useState<HardwareMetrics>({
    cameraFps: 60,
    processingFps: 60,
    droppedFrames: 0,
    frameLatencyMs: 16.6,
    resolution: { width: 1280, height: 720 },
  });

  const [lastCrossing, setLastCrossing] = useState<{
    zoneName: string;
    timestamp: number;
    snapshot: string;
  } | null>(null);

  const zonesRef = useRef<DetectionZone[]>(zones);
  zonesRef.current = zones;

  useEffect(() => {
    cameraManager.getAvailableCameras().then((devices) => {
      setAvailableCameras(devices);
      if (devices.length > 0 && !selectedCameraId) {
        const backCam = devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment")
        );
        setSelectedCameraId(backCam ? backCam.deviceId : devices[0].deviceId);
      }
    });

    startStream();

    return () => {
      cameraManager.stopCamera();
    };
  }, []);

  const startStream = async (camId?: string) => {
    if (!videoRef.current) return;
    setCameraError(null);
    try {
      await cameraManager.startCamera(videoRef.current, "environment", camId || selectedCameraId);
      setIsCameraActive(true);

      cameraManager.startFrameLoop((video, frameTime) => {
        processFrame(video, frameTime);
      });
    } catch (err: any) {
      setCameraError(err.message || "Failed to initialize camera sensor");
      setIsCameraActive(false);
    }
  };

  const handleFlipCamera = () => {
    if (availableCameras.length <= 1) return;
    const currentIndex = availableCameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCam = availableCameras[nextIndex];
    setSelectedCameraId(nextCam.deviceId);
    startStream(nextCam.deviceId);
  };

  const togglePoseModel = async () => {
    if (!usePoseModel) {
      setIsPoseLoading(true);
      const ok = await torsoTracker.loadMediaPipePose();
      setIsPoseLoading(false);
      setUsePoseModel(ok);
    } else {
      setUsePoseModel(false);
    }
  };

  const processFrame = useCallback(
    (video: HTMLVideoElement, frameTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const torso = torsoTracker.trackFrame(video, frameTime);

      const activeZones = zonesRef.current;
      for (const zone of activeZones) {
        if (!zone.active) continue;

        const isSelected = zone.zoneId === selectedZoneId;
        const x1 = zone.lineCoordinates.x1 * canvas.width;
        const y1 = zone.lineCoordinates.y1 * canvas.height;
        const x2 = zone.lineCoordinates.x2 * canvas.width;
        const y2 = zone.lineCoordinates.y2 * canvas.height;

        ctx.save();
        ctx.strokeStyle = zone.color || "#ccff00";
        ctx.lineWidth = isSelected ? 4 : 2.5;
        ctx.shadowColor = zone.color || "#ccff00";
        ctx.shadowBlur = isSelected ? 12 : 6;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        ctx.fillStyle = zone.color || "#ccff00";
        ctx.beginPath();
        if (zone.detectionDirection === "left_to_right") {
          ctx.moveTo(midX - 10, midY - 8);
          ctx.lineTo(midX + 10, midY);
          ctx.lineTo(midX - 10, midY + 8);
        } else if (zone.detectionDirection === "right_to_left") {
          ctx.moveTo(midX + 10, midY - 8);
          ctx.lineTo(midX - 10, midY);
          ctx.lineTo(midX + 10, midY + 8);
        } else {
          ctx.arc(midX, midY, 6, 0, 2 * Math.PI);
        }
        ctx.fill();

        ctx.fillStyle = "rgba(10, 12, 15, 0.85)";
        ctx.strokeStyle = zone.color || "#ccff00";
        ctx.lineWidth = 1;
        ctx.fillRect(midX - 45, y1 + 10, 90, 22);
        ctx.strokeRect(midX - 45, y1 + 10, 90, 22);

        ctx.font = "bold 11px -apple-system, sans-serif";
        ctx.fillStyle = zone.color || "#ccff00";
        ctx.textAlign = "center";
        ctx.fillText(zone.name.toUpperCase(), midX, y1 + 25);
        ctx.restore();
      }

      if (torso) {
        const tx = torso.torsoCenter.x * canvas.width;
        const ty = torso.torsoCenter.y * canvas.height;

        ctx.save();
        ctx.strokeStyle = "rgba(204, 255, 0, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(
          torso.boundingBox.x * canvas.width,
          torso.boundingBox.y * canvas.height,
          torso.boundingBox.width * canvas.width,
          torso.boundingBox.height * canvas.height
        );

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, 16, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = "#ccff00";
        ctx.beginPath();
        ctx.arc(tx, ty, 6, 0, 2 * Math.PI);
        ctx.fill();

        ctx.font = "10px monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          `TORSO [${Math.round(torso.confidence * 100)}%]`,
          tx + 20,
          ty + 4
        );
        ctx.restore();

        const crossings = lineDetector.evaluate(
          torso,
          activeZones,
          video,
          sessionId,
          deviceId,
          deviceName,
          clockOffsetMs
        );

        if (crossings.length > 0) {
          for (const c of crossings) {
            setLastCrossing({
              zoneName: c.zone.name,
              timestamp: c.interpolatedTimestamp,
              snapshot: c.frameSnapshot,
            });
            onTimingEventDetected(c.event);
          }
        }
      }

      setMetrics(cameraManager.getMetrics());
    },
    [
      selectedZoneId,
      cameraManager,
      torsoTracker,
      lineDetector,
      sessionId,
      deviceId,
      deviceName,
      clockOffsetMs,
      onTimingEventDetected,
    ]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;

    // Generous touch target margin (0.12) for fingers on small screens
    for (const zone of zones) {
      const lineX = (zone.lineCoordinates.x1 + zone.lineCoordinates.x2) / 2;
      if (Math.abs(clickX - lineX) < 0.12) {
        setIsDraggingLine(true);
        setDraggedZoneId(zone.zoneId);
        setSelectedZoneId(zone.zoneId);
        break;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingLine || !draggedZoneId || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const newX = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));

    const updated = zones.map((z) => {
      if (z.zoneId === draggedZoneId) {
        return {
          ...z,
          lineCoordinates: {
            ...z.lineCoordinates,
            x1: Math.round(newX * 1000) / 1000,
            x2: Math.round(newX * 1000) / 1000,
          },
        };
      }
      return z;
    });

    onUpdateZones(updated);
  };

  const handlePointerUp = () => {
    setIsDraggingLine(false);
    setDraggedZoneId(null);
  };

  const handleAddLine = () => {
    const count = zones.length + 1;
    const colors = ["#ccff00", "#00f0ff", "#ff3344", "#ffaa00", "#e0e7ff"];
    const color = colors[count % colors.length];

    const newZone: DetectionZone = {
      zoneId: `zone_${Date.now()}`,
      deviceId,
      zoneType: count === 1 ? "start" : count === 2 ? "finish" : "split",
      name: `Gate ${count}`,
      lineCoordinates: {
        x1: 0.2 + (count * 0.25) % 0.6,
        y1: 0.05,
        x2: 0.2 + (count * 0.25) % 0.6,
        y2: 0.95,
      },
      detectionDirection: "left_to_right",
      confidenceThreshold: 0.6,
      cooldownMs: 1500,
      color,
      active: true,
    };

    onUpdateZones([...zones, newZone]);
    setSelectedZoneId(newZone.zoneId);
  };

  const handleDeleteLine = (id: string) => {
    if (zones.length <= 1) return;
    const remaining = zones.filter((z) => z.zoneId !== id);
    onUpdateZones(remaining);
    setSelectedZoneId(remaining[0]?.zoneId || "");
  };

  const handleSimulateCrossing = () => {
    const targetZone = zones.find((z) => z.zoneId === selectedZoneId) || zones[0];
    if (!targetZone) return;

    const simulatedEvent: TimingEvent = {
      eventId: `sim_${Date.now()}`,
      sessionId,
      deviceId,
      deviceName,
      eventType:
        targetZone.zoneType === "start"
          ? "START"
          : targetZone.zoneType === "finish"
          ? "FINISH"
          : "SPLIT",
      localTimestamp: performance.now(),
      synchronizedTimestamp: performance.now() + clockOffsetMs,
      confidence: 0.95,
      detectionZoneId: targetZone.zoneId,
      frameReference: cameraManager.captureSnapshot() || undefined,
      notes: `Simulated crossing for ${targetZone.name}`,
    };

    onTimingEventDetected(simulatedEvent);
  };

  const selectedZone = zones.find((z) => z.zoneId === selectedZoneId) || zones[0];

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-y-auto lg:overflow-hidden bg-[#0a0c0f] pb-20 lg:pb-0">
      {/* Studio Viewport */}
      <div className="flex-1 flex flex-col p-2.5 sm:p-4 gap-2.5 min-h-[360px] sm:min-h-[460px]">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950/90 p-2 sm:p-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="text-[11px] sm:text-xs font-bold text-white uppercase tracking-wider truncate">
              Camera Studio
            </span>
            <span className="rounded bg-white/10 px-1.5 py-0.2 text-[9px] font-mono text-zinc-300">
              {metrics.cameraFps} FPS
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Flip Camera */}
            {availableCameras.length > 1 && (
              <button
                onClick={handleFlipCamera}
                className="flex items-center gap-1 rounded-lg border border-white/15 bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-zinc-300 active:scale-95"
                title="Switch Camera (Front/Rear)"
              >
                <SwitchCamera className="h-3.5 w-3.5 text-[#ccff00]" />
                <span className="hidden xs:inline">Flip</span>
              </button>
            )}

            {/* MediaPipe Pose Toggle */}
            <button
              onClick={togglePoseModel}
              disabled={isPoseLoading}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                usePoseModel
                  ? "border-[#ccff00] bg-[#ccff00]/15 text-[#ccff00]"
                  : "border-white/15 bg-zinc-900 text-zinc-400"
              }`}
            >
              <Activity className="h-3 w-3" />
              <span>{isPoseLoading ? "..." : usePoseModel ? "Pose ON" : "Centroid"}</span>
            </button>

            {/* Test Crossing */}
            <button
              onClick={handleSimulateCrossing}
              className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-950/40 px-2 py-1 text-[11px] font-semibold text-amber-300 active:scale-95"
            >
              <Zap className="h-3 w-3 text-amber-400" />
              <span className="hidden xs:inline">Test Crossing</span>
              <span className="xs:hidden">Test</span>
            </button>
          </div>
        </div>

        {/* Video & Canvas Viewport */}
        <div className="relative flex-1 min-h-[260px] sm:min-h-[380px] rounded-2xl border border-white/15 bg-zinc-950 overflow-hidden flex items-center justify-center shadow-2xl">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-contain pointer-events-none"
          />

          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="absolute inset-0 w-full h-full object-contain cursor-crosshair touch-none"
          />

          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-4 text-center z-20">
              <ShieldAlert className="h-8 w-8 text-amber-400 mb-2" />
              <h3 className="text-sm font-bold text-white mb-1">Camera Sensor Offline</h3>
              <p className="text-[11px] text-zinc-400 max-w-xs mb-3">{cameraError}</p>
              <button
                onClick={() => startStream()}
                className="rounded-xl bg-[#ccff00] px-3.5 py-1.5 text-xs font-bold text-black"
              >
                Retry Camera
              </button>
            </div>
          )}

          {/* Telemetry HUD */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
            <div className="rounded bg-black/80 backdrop-blur-md px-2 py-0.5 font-mono text-[9px] text-[#ccff00]">
              {metrics.cameraFps} FPS
            </div>
            <div className="rounded bg-black/80 backdrop-blur-md px-2 py-0.5 font-mono text-[9px] text-zinc-400">
              {metrics.droppedFrames} DROPPED
            </div>
          </div>

          {/* Interactive Drag Hint */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/80 backdrop-blur-md border border-white/15 px-3 py-1 font-mono text-[9px] text-zinc-300 flex items-center gap-1.5 pointer-events-none">
            <MoveHorizontal className="h-3 w-3 text-[#ccff00]" />
            <span>DRAG LINE ACROSS TRACK TO POSITION GATE</span>
          </div>

          {/* Last Crossing Thumbnail */}
          {lastCrossing && (
            <div className="absolute bottom-2 right-2 rounded-xl bg-black/85 backdrop-blur-md border border-[#ccff00]/40 p-1.5 shadow-2xl max-w-[140px]">
              <div className="text-[9px] font-mono font-bold text-[#ccff00] mb-0.5 truncate">
                ⚡ {lastCrossing.zoneName}
              </div>
              <img
                src={lastCrossing.snapshot}
                alt="Crossing"
                className="w-full h-14 object-cover rounded border border-white/10"
              />
            </div>
          )}
        </div>
      </div>

      {/* Right / Bottom Calibration Controls */}
      <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0d0f14] flex flex-col p-3 sm:p-4 gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[#ccff00]" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Gate Calibration ({zones.length})
            </h3>
          </div>
          <button
            onClick={handleAddLine}
            className="flex items-center gap-1 rounded-lg border border-[#ccff00]/40 bg-[#ccff00]/10 px-2.5 py-1 text-xs font-bold text-[#ccff00] active:scale-95 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Line
          </button>
        </div>

        {/* Line Selection Buttons (Horizontally scrollable on mobile) */}
        <div className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          {zones.map((z) => {
            const isSelected = z.zoneId === selectedZoneId;
            return (
              <div
                key={z.zoneId}
                onClick={() => setSelectedZoneId(z.zoneId)}
                className={`flex items-center justify-between gap-2 rounded-xl border p-2 cursor-pointer transition-all flex-shrink-0 min-w-[130px] lg:min-w-0 ${
                  isSelected
                    ? "border-[#ccff00] bg-[#ccff00]/10 shadow-[0_0_12px_rgba(204,255,0,0.06)]"
                    : "border-white/10 bg-zinc-950"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: z.color || "#ccff00" }}
                  />
                  <div>
                    <div className="text-xs font-bold text-white truncate max-w-[80px] lg:max-w-none">
                      {z.name}
                    </div>
                    <div className="text-[9px] font-mono text-zinc-400">
                      {z.zoneType.toUpperCase()} • X={(z.lineCoordinates.x1 * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                {zones.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteLine(z.zoneId);
                    }}
                    className="p-1 text-zinc-500 hover:text-red-400 active:scale-90"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Line Settings */}
        {selectedZone && (
          <div className="rounded-xl border border-white/10 bg-zinc-950 p-3 space-y-3">
            <div>
              <label className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                Gate Role
              </label>
              <div className="grid grid-cols-4 gap-1">
                {(["start", "finish", "split", "lap"] as DetectionZone["zoneType"][]).map(
                  (role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        const updated = zones.map((z) =>
                          z.zoneId === selectedZone.zoneId ? { ...z, zoneType: role } : z
                        );
                        onUpdateZones(updated);
                      }}
                      className={`rounded-lg border py-1 text-[10px] font-bold uppercase transition-all ${
                        selectedZone.zoneType === role
                          ? "border-[#ccff00] bg-[#ccff00] text-black"
                          : "border-white/10 bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      {role}
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                Crossing Direction
              </label>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const updated = zones.map((z) =>
                      z.zoneId === selectedZone.zoneId
                        ? { ...z, detectionDirection: "left_to_right" as const }
                        : z
                    );
                    onUpdateZones(updated);
                  }}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[10px] font-bold ${
                    selectedZone.detectionDirection === "left_to_right"
                      ? "border-[#ccff00] bg-[#ccff00]/15 text-[#ccff00]"
                      : "border-white/10 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  <ArrowRight className="h-3 w-3" />
                  L → R
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const updated = zones.map((z) =>
                      z.zoneId === selectedZone.zoneId
                        ? { ...z, detectionDirection: "right_to_left" as const }
                        : z
                    );
                    onUpdateZones(updated);
                  }}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[10px] font-bold ${
                    selectedZone.detectionDirection === "right_to_left"
                      ? "border-[#ccff00] bg-[#ccff00]/15 text-[#ccff00]"
                      : "border-white/10 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  <ArrowLeft className="h-3 w-3" />
                  R → L
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const updated = zones.map((z) =>
                      z.zoneId === selectedZone.zoneId
                        ? { ...z, detectionDirection: "bidirectional" as const }
                        : z
                    );
                    onUpdateZones(updated);
                  }}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[10px] font-bold ${
                    selectedZone.detectionDirection === "bidirectional"
                      ? "border-[#ccff00] bg-[#ccff00]/15 text-[#ccff00]"
                      : "border-white/10 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  Both
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Launch Live Console Button */}
        <div className="mt-auto pt-1">
          <button
            onClick={onOpenLiveConsole}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#ccff00] py-3 text-xs font-bold text-black shadow-lg hover:bg-[#b8e600] active:scale-95 transition-all"
          >
            <Play className="h-4 w-4" />
            Launch Live Timing Console
          </button>
        </div>
      </div>
    </div>
  );
};
