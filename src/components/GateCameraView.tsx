"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  SwitchCamera,
  Sliders,
  CheckCircle2,
  Flag,
  Zap,
  Clock,
  ArrowLeft,
  Activity,
  AlertCircle,
  Wifi,
} from "lucide-react";
import { DeviceRole, DetectionZone, TimingEvent, HardwareMetrics } from "@/types";
import { CameraManager } from "@/lib/vision/cameraManager";
import { TorsoTracker, TorsoLandmarkData } from "@/lib/vision/torsoTracker";
import { LineCrossingDetector, GateDetectionState } from "@/lib/vision/lineCrossingDetector";
import { soundEngine } from "@/lib/audio/soundEngine";

interface GateCameraViewProps {
  deviceRole: DeviceRole;
  sessionId: string;
  deviceId: string;
  deviceName: string;
  clockOffsetMs: number;
  zones: DetectionZone[];
  onUpdateZones: (zones: DetectionZone[]) => void;
  onTimingEventDetected: (event: TimingEvent) => void;
  onSwitchToConsole: () => void;
}

export const GateCameraView: React.FC<GateCameraViewProps> = ({
  deviceRole,
  sessionId,
  deviceId,
  deviceName,
  clockOffsetMs,
  zones,
  onUpdateZones,
  onTimingEventDetected,
  onSwitchToConsole,
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

  // Optical Tracking Telemetry
  const [isTorsoDetected, setIsTorsoDetected] = useState<boolean>(false);
  const [gateDetectionState, setGateDetectionState] = useState<GateDetectionState>("WAITING_FOR_APPROACH");
  const [flashBreak, setFlashBreak] = useState<boolean>(false);
  const [lastBreakEvent, setLastBreakEvent] = useState<{ time: number; snapshot: string } | null>(null);

  // Line dragging
  const [isDraggingLine, setIsDraggingLine] = useState<boolean>(false);
  const zonesRef = useRef<DetectionZone[]>(zones);
  zonesRef.current = zones;

  // Determine gate type from deviceRole
  const gateType =
    deviceRole === "start_camera"
      ? "start"
      : deviceRole === "split_camera"
      ? "split"
      : "finish";

  // Active zone for this gate camera
  const myZone =
    zones.find((z) => z.zoneType === gateType) ||
    zones[0] || {
      zoneId: `zone_${gateType}_main`,
      deviceId,
      zoneType: gateType,
      name:
        gateType === "start"
          ? "Start Gate"
          : gateType === "split"
          ? "Flying Split"
          : "Finish Line",
      lineCoordinates: { x1: 0.5, y1: 0.05, x2: 0.5, y2: 0.95 },
      detectionDirection: "bidirectional",
      confidenceThreshold: 0.6,
      cooldownMs: 1500,
      color: gateType === "start" ? "#00f0ff" : gateType === "split" ? "#ff00ea" : "#ccff00",
      active: true,
    };

  // Mount camera
  useEffect(() => {
    let mounted = true;

    cameraManager.getAvailableCameras().then((devices) => {
      if (!mounted) return;
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

    startCamera();

    return () => {
      mounted = false;
      cameraManager.stopCamera();
    };
  }, []);

  const startCamera = async (camId?: string) => {
    if (!videoRef.current) return;
    setCameraError(null);
    try {
      await cameraManager.startCamera(
        videoRef.current,
        "environment",
        camId || selectedCameraId
      );
      setIsCameraActive(true);

      cameraManager.startFrameLoop((video, frameTime) => {
        processFrame(video, frameTime);
      });
    } catch (err: any) {
      setCameraError(err?.message || "Camera access required for optical gate");
      setIsCameraActive(false);
    }
  };

  const flipCamera = () => {
    if (availableCameras.length <= 1) return;
    const currentIndex = availableCameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCam = availableCameras[nextIndex];
    setSelectedCameraId(nextCam.deviceId);
    startCamera(nextCam.deviceId);
  };

  // Vision loop
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

      // 1. Biomechanical Torso & Chest Tracking
      const torso = torsoTracker.trackFrame(video, frameTime);
      setIsTorsoDetected(!!torso);

      const zone = myZone;
      const x1 = zone.lineCoordinates.x1 * canvas.width;
      const y1 = zone.lineCoordinates.y1 * canvas.height;
      const x2 = zone.lineCoordinates.x2 * canvas.width;
      const y2 = zone.lineCoordinates.y2 * canvas.height;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      const gStatus = lineDetector.getGateStatus(zone.zoneId);
      setGateDetectionState(gStatus);

      const isApproaching = gStatus === "RUNNER_APPROACHING";
      const isBroken = gStatus === "GATE_BROKEN" || flashBreak;

      // 2. Draw Virtual Gate Laser Line
      ctx.save();
      ctx.strokeStyle = isBroken ? "#ffffff" : isApproaching ? "#ffff00" : zone.color || "#ccff00";
      ctx.lineWidth = isBroken ? 6 : isApproaching ? 4 : 2.5;
      ctx.shadowColor = isBroken ? "#ffffff" : zone.color || "#ccff00";
      ctx.shadowBlur = isBroken ? 25 : isApproaching ? 18 : 8;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Top and Bottom Emitter Beacons
      ctx.fillStyle = isBroken ? "#ffffff" : zone.color || "#ccff00";
      ctx.beginPath();
      ctx.arc(x1, y1 + 12, 7, 0, 2 * Math.PI);
      ctx.arc(x2, y2 - 12, 7, 0, 2 * Math.PI);
      ctx.fill();

      // Center Gate Beacon
      ctx.beginPath();
      ctx.arc(midX, midY, isBroken ? 14 : 8, 0, 2 * Math.PI);
      ctx.fill();

      // Gate Tag Badge
      const gateTitle =
        gateType === "start"
          ? "START GATE"
          : gateType === "split"
          ? "SPLIT GATE"
          : "FINISH GATE";

      const tagText = isBroken
        ? "BREAK TRANSMITTED!"
        : isApproaching
        ? "RUNNER APPROACHING"
        : `${gateTitle} ARMED`;

      const badgeW = Math.max(120, tagText.length * 8);
      ctx.fillStyle = isBroken
        ? "rgba(255, 255, 255, 0.95)"
        : isApproaching
        ? "rgba(234, 179, 8, 0.9)"
        : "rgba(10, 12, 15, 0.88)";
      ctx.strokeStyle = zone.color || "#ccff00";
      ctx.lineWidth = 1;
      ctx.fillRect(midX - badgeW / 2, y1 + 16, badgeW, 26);
      ctx.strokeRect(midX - badgeW / 2, y1 + 16, badgeW, 26);

      ctx.font = "bold 11px monospace";
      ctx.fillStyle = isBroken ? "#0a0c0f" : isApproaching ? "#000000" : zone.color || "#ccff00";
      ctx.textAlign = "center";
      ctx.fillText(tagText, midX, y1 + 33);
      ctx.restore();

      // 3. Render Torso Reticle & Bounding Box
      if (torso) {
        const tx = torso.torsoCenter.x * canvas.width;
        const ty = torso.torsoCenter.y * canvas.height;

        ctx.save();
        ctx.strokeStyle = "rgba(204, 255, 0, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
          torso.boundingBox.x * canvas.width,
          torso.boundingBox.y * canvas.height,
          torso.boundingBox.width * canvas.width,
          torso.boundingBox.height * canvas.height
        );

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(tx, ty, 16, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = "#ccff00";
        ctx.beginPath();
        ctx.arc(tx, ty, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`TORSO [${Math.round(torso.confidence * 100)}%]`, tx + 22, ty - 4);
        ctx.restore();

        // 4. Evaluate Crossing / Penetration
        const crossings = lineDetector.evaluate(
          torso,
          [zone],
          video,
          sessionId,
          deviceId,
          deviceName,
          clockOffsetMs,
          true
        );

        if (crossings.length > 0) {
          for (const c of crossings) {
            setFlashBreak(true);
            setTimeout(() => setFlashBreak(false), 900);
            setLastBreakEvent({ time: c.interpolatedTimestamp, snapshot: c.frameSnapshot });

            // Forward to master console
            onTimingEventDetected(c.event);

            // Audio & Haptic confirmation on this sensor phone
            soundEngine.playFinishChime();
            if (typeof window !== "undefined" && "vibrate" in navigator) {
              try {
                navigator.vibrate([100, 60, 150]);
              } catch {}
            }
          }
        }
      }
    },
    [cameraManager, torsoTracker, lineDetector, myZone, sessionId, deviceId, deviceName, clockOffsetMs, onTimingEventDetected, flashBreak]
  );

  // Line dragging
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const lineX = (myZone.lineCoordinates.x1 + myZone.lineCoordinates.x2) / 2;
    if (Math.abs(clickX - lineX) < 0.15) {
      setIsDraggingLine(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingLine || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const newX = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));

    const updated = zones.map((z) => {
      if (z.zoneId === myZone.zoneId || z.zoneType === myZone.zoneType) {
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
  };

  const nudgeLine = (delta: number) => {
    const curX = (myZone.lineCoordinates.x1 + myZone.lineCoordinates.x2) / 2;
    const newX = Math.max(0.05, Math.min(0.95, curX + delta));
    const updated = zones.map((z) => {
      if (z.zoneId === myZone.zoneId || z.zoneType === myZone.zoneType) {
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

  return (
    <div className="flex-1 flex flex-col h-full bg-black select-none overflow-hidden relative">
      {/* Top Minimal Sensor Header */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-3.5 bg-gradient-to-b from-black/90 via-black/50 to-transparent">
        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchToConsole}
            className="flex items-center gap-1 rounded-xl border border-white/15 bg-zinc-900/80 px-2.5 py-1 text-xs font-bold text-zinc-300 hover:text-white backdrop-blur-md active:scale-95 transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Console
          </button>

          <div className="flex items-center gap-1.5 rounded-xl border border-[#ccff00]/40 bg-[#ccff00]/10 px-2.5 py-1 text-xs font-mono font-bold text-[#ccff00] backdrop-blur-md">
            {gateType === "start" ? (
              <Zap className="h-3.5 w-3.5" />
            ) : gateType === "split" ? (
              <Clock className="h-3.5 w-3.5" />
            ) : (
              <Flag className="h-3.5 w-3.5" />
            )}
            <span className="uppercase">
              {gateType === "start"
                ? "Start Gate"
                : gateType === "split"
                ? "Flying Split"
                : "Finish Gate"}
            </span>
          </div>
        </div>

        {/* Connection status pill */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/70 px-2.5 py-1 text-[10px] font-mono text-emerald-300 backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>LINKED // {sessionId}</span>
          </div>

          {availableCameras.length > 1 && (
            <button
              onClick={flipCamera}
              className="rounded-xl border border-white/20 bg-zinc-900/80 p-2 text-zinc-300 hover:text-white backdrop-blur-md active:scale-95"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Full-Screen Viewfinder */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover select-none"
        />

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute inset-0 w-full h-full object-cover touch-none cursor-ew-resize select-none"
        />

        {/* Break Flash Banner */}
        {flashBreak && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#ccff00]/25 backdrop-blur-xs z-20 pointer-events-none animate-in fade-in">
            <div className="rounded-2xl border-2 border-white bg-black/90 p-5 text-center shadow-[0_0_50px_rgba(204,255,0,0.8)]">
              <CheckCircle2 className="h-12 w-12 text-[#ccff00] mx-auto mb-2 animate-bounce" />
              <h3 className="text-xl font-black text-white uppercase tracking-wider">
                Beam Broken!
              </h3>
              <p className="text-xs font-mono text-[#ccff00] mt-1 font-bold">
                Time Transmitted to Console
              </p>
            </div>
          </div>
        )}

        {/* Camera Permission Error */}
        {cameraError && !isCameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-zinc-950 z-30">
            <AlertCircle className="h-10 w-10 text-amber-400 mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">Camera Sensor Needed</h4>
            <p className="text-xs text-zinc-400 max-w-sm mb-3">{cameraError}</p>
            <button
              onClick={() => startCamera()}
              className="rounded-xl bg-[#ccff00] text-black px-4 py-2 text-xs font-bold"
            >
              Enable Camera Sensor
            </button>
          </div>
        )}
      </div>

      {/* Bottom Gate Alignment Toolbar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between p-3.5 bg-gradient-to-t from-black/95 via-black/60 to-transparent border-t border-white/10 text-xs font-mono">
        <div className="flex items-center gap-2 text-zinc-400">
          <Sliders className="h-4 w-4 text-[#ccff00]" />
          <span className="text-white font-bold">LINE:</span>
          <span className="text-[#ccff00] font-bold">
            {Math.round(
              (((myZone.lineCoordinates.x1 || 0.5) +
                (myZone.lineCoordinates.x2 || 0.5)) /
                2) *
                100
            )}
            %
          </span>
          <span className="text-[10px] text-zinc-500 hidden sm:inline">(Drag to align with track)</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => nudgeLine(-0.03)}
            className="rounded-xl border border-white/15 bg-zinc-900/90 px-3 py-1.5 text-zinc-300 hover:text-white active:scale-95"
          >
            ◀ Move Left
          </button>
          <button
            onClick={() => nudgeLine(0.03)}
            className="rounded-xl border border-white/15 bg-zinc-900/90 px-3 py-1.5 text-zinc-300 hover:text-white active:scale-95"
          >
            Move Right ▶
          </button>
        </div>
      </div>
    </div>
  );
};

