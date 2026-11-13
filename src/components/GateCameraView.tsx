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
  Play,
  RotateCcw,
  ShieldCheck,
  Pause,
} from "lucide-react";
import { DeviceRole, DetectionZone, TimingEvent } from "@/types";
import { CameraManager } from "@/lib/vision/cameraManager";
import { TorsoTracker } from "@/lib/vision/torsoTracker";
import { LineCrossingDetector, GateDetectionState } from "@/lib/vision/lineCrossingDetector";
import { soundEngine } from "@/lib/audio/soundEngine";
import { getPreciseTime } from "@/lib/timing/clockSync";

interface GateCameraViewProps {
  deviceRole: DeviceRole;
  sessionId: string;
  deviceId: string;
  deviceName: string;
  clockOffsetMs: number;
  zones: DetectionZone[];
  resetKey?: number;
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
  resetKey = 0,
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

  // Camera activation state: DO NOT auto-turn on! Wait for user tap
  const [isCameraStarted, setIsCameraStarted] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Optical Tracking Telemetry
  const [isTorsoDetected, setIsTorsoDetected] = useState<boolean>(false);
  const [gateDetectionState, setGateDetectionState] = useState<GateDetectionState>("WAITING_FOR_APPROACH");
  const [flashBreak, setFlashBreak] = useState<boolean>(false);
  const [lastBreakEvent, setLastBreakEvent] = useState<{ time: number; snapshot: string } | null>(null);

  // Sensor Frozen state: when finish line breaks, sensor locks until console re-arms
  const [isGateFrozen, setIsGateFrozen] = useState<boolean>(false);

  // Line dragging
  const [isDraggingLine, setIsDraggingLine] = useState<boolean>(false);

  // Determine gate type from deviceRole
  const gateType =
    deviceRole === "start_camera"
      ? "start"
      : deviceRole === "split_camera"
      ? "split"
      : "finish";

  // Active zone for this gate camera (strictly enforces current gateType role)
  const matchedZone = zones.find((z) => z.zoneType === gateType);
  const myZone: DetectionZone = {
    ...(matchedZone || zones[0] || {}),
    zoneId: matchedZone?.zoneId || `zone_${gateType}_main`,
    deviceId,
    zoneType: gateType,
    name:
      gateType === "start"
        ? "Start Gate"
        : gateType === "split"
        ? "Flying Split Gate"
        : "Finish Line Gate",
    lineCoordinates: matchedZone?.lineCoordinates || { x1: 0.5, y1: 0.05, x2: 0.5, y2: 0.95 },
    detectionDirection: matchedZone?.detectionDirection || "bidirectional",
    confidenceThreshold: 0.7,
    cooldownMs: 1200,
    color: gateType === "start" ? "#00f0ff" : gateType === "split" ? "#ff00ea" : "#ccff00",
    active: true,
  };

  // 1. Initial camera enumeration on mount (does NOT start camera stream automatically)
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

    return () => {
      mounted = false;
      cameraManager.stopCamera();
    };
  }, []);

  // 2. React to remote console reset / re-arm
  useEffect(() => {
    if (resetKey > 0) {
      handleReArmSensor();
    }
  }, [resetKey]);

  // Start the physical camera stream
  const startCamera = async (camId?: string) => {
    setIsStarting(true);
    setCameraError(null);

    const videoEl = videoRef.current;
    if (!videoEl) {
      setCameraError("Camera video element not available. Please tap again.");
      setIsStarting(false);
      return;
    }

    try {
      const activeCamId = camId || selectedCameraId || undefined;
      await cameraManager.startCamera(
        videoEl,
        "environment",
        activeCamId
      );
      setIsCameraActive(true);
      setIsCameraStarted(true);
      setIsGateFrozen(false);
      lineDetector.reset();
      torsoTracker.reset();

      cameraManager.startFrameLoop((video) => {
        const frameTime = getPreciseTime();
        processFrame(video, frameTime);
      });
    } catch (err: any) {
      console.error("Camera activation error:", err);
      setCameraError(
        err?.message || "Camera access required. Please allow camera permissions in your browser."
      );
      setIsCameraActive(false);
    } finally {
      setIsStarting(false);
    }
  };

  const stopCameraStream = () => {
    cameraManager.stopCamera();
    setIsCameraActive(false);
    setIsCameraStarted(false);
  };

  // Re-arm the gate sensor for the next sprint
  const handleReArmSensor = () => {
    setIsGateFrozen(false);
    setFlashBreak(false);
    setLastBreakEvent(null);
    lineDetector.reset();
    torsoTracker.reset();

    // Restart frame loop if camera stream is active
    if (isCameraActive && videoRef.current) {
      cameraManager.stopFrameLoop();
      cameraManager.startFrameLoop((video) => {
        const frameTime = getPreciseTime();
        processFrame(video, frameTime);
      });
    }
  };

  const flipCamera = () => {
    if (availableCameras.length <= 1) return;
    const currentIndex = availableCameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCam = availableCameras[nextIndex];
    setSelectedCameraId(nextCam.deviceId);
    if (isCameraActive) {
      startCamera(nextCam.deviceId);
    }
  };

  // Vision loop
  const processFrame = useCallback(
    (video: HTMLVideoElement, frameTime: number) => {
      if (isGateFrozen) return; // Do not process when frozen after finish break

      const canvas = canvasRef.current;
      if (!canvas) return;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Solid Biomechanical Torso Tracking (strictly rejects waving hands & shadows)
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

      const isBroken = gStatus === "GATE_BROKEN" || flashBreak || isGateFrozen;

      // 2. Draw Virtual Gate Laser Line
      ctx.save();
      ctx.strokeStyle = isBroken ? "#ffffff" : zone.color || "#ccff00";
      ctx.lineWidth = isBroken ? 6 : 2.5;
      ctx.shadowColor = isBroken ? "#ffffff" : zone.color || "#ccff00";
      ctx.shadowBlur = isBroken ? 25 : 8;

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
        ? "LINE BROKEN // RECORDED"
        : `${gateTitle} ARMED`;

      const badgeW = Math.max(130, tagText.length * 8);
      ctx.fillStyle = isBroken ? "rgba(255, 255, 255, 0.95)" : "rgba(10, 12, 15, 0.88)";
      ctx.strokeStyle = zone.color || "#ccff00";
      ctx.lineWidth = 1;
      ctx.fillRect(midX - badgeW / 2, y1 + 16, badgeW, 26);
      ctx.strokeRect(midX - badgeW / 2, y1 + 16, badgeW, 26);

      ctx.font = "bold 11px monospace";
      ctx.fillStyle = isBroken ? "#0a0c0f" : zone.color || "#ccff00";
      ctx.textAlign = "center";
      ctx.fillText(tagText, midX, y1 + 33);
      ctx.restore();

      // 3. Render Solid Torso Reticle & Bounding Box
      if (torso) {
        const tx = torso.torsoCenter.x * canvas.width;
        const ty = torso.torsoCenter.y * canvas.height;

        ctx.save();
        ctx.strokeStyle = "rgba(204, 255, 0, 0.6)";
        ctx.lineWidth = 2;
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
        ctx.fillText(`SOLID TORSO [${Math.round(torso.confidence * 100)}%]`, tx + 22, ty - 4);
        ctx.restore();

        // 4. Evaluate Crossing / Penetration of Solid Body
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
            setLastBreakEvent({ time: c.interpolatedTimestamp, snapshot: c.frameSnapshot });

            // 1. Forward timing event to Master Console IMMEDIATELY
            onTimingEventDetected(c.event);

            // 2. STOP / FREEZE FINISH GATE SENSOR IMMEDIATELY
            setIsGateFrozen(true);
            cameraManager.stopFrameLoop();

            // 3. Audio & Haptic confirmation on sensor phone
            soundEngine.playFinishChime();
            if (typeof window !== "undefined" && "vibrate" in navigator) {
              try {
                navigator.vibrate([120, 60, 200]);
              } catch {}
            }
            break; // Stop after first valid crossing
          }
        }
      }
    },
    [cameraManager, torsoTracker, lineDetector, myZone, sessionId, deviceId, deviceName, clockOffsetMs, onTimingEventDetected, flashBreak, isGateFrozen]
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

  // --- MAIN UNIFIED RENDER ---
  return (
    <div className="flex-1 flex flex-col h-full bg-black select-none overflow-hidden relative">
      {/* 1. Underlying Viewfinder & Canvas (ALWAYS mounted so videoRef.current is ready immediately) */}
      <div className="relative flex-1 w-full h-full overflow-hidden bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
        />

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="absolute inset-0 h-full w-full object-cover touch-none cursor-ew-resize z-10"
        />

        {/* FROZEN STATE OVERLAY: When gate is broken, freezes sensor immediately */}
        {isGateFrozen && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4 text-center animate-in fade-in duration-200">
            <div className="max-w-md w-full rounded-3xl border border-white/20 bg-zinc-950 p-6 shadow-2xl flex flex-col items-center space-y-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ccff00]/20 border border-[#ccff00]/40 text-[#ccff00]">
                <ShieldCheck className="h-8 w-8 animate-bounce" />
              </div>

              <div>
                <div className="inline-flex items-center gap-1 rounded-full border border-[#ccff00]/40 bg-[#ccff00]/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-[#ccff00] uppercase mb-1">
                  Optical Gate Break Recorded
                </div>
                <h3 className="text-xl font-black uppercase text-white tracking-wider">
                  Finish Line Broken!
                </h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Official sub-frame torso crossing transmitted to Console.
                </p>
              </div>

              {/* Photo-Finish Thumbnail Preview */}
              {lastBreakEvent?.snapshot && (
                <div className="w-full rounded-2xl overflow-hidden border border-white/15 bg-black my-2">
                  <img
                    src={lastBreakEvent.snapshot}
                    alt="Photo finish proof"
                    className="w-full max-h-44 object-contain mx-auto"
                  />
                </div>
              )}

              <div className="p-2.5 rounded-xl bg-zinc-900 border border-white/10 w-full text-xs font-mono text-zinc-300 flex items-center justify-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#ccff00] animate-pulse" />
                <span>Sensor Locked • Ready when Console Re-Arms</span>
              </div>

              {/* Manual Re-Arm Button */}
              <button
                onClick={handleReArmSensor}
                className="w-full py-3 rounded-xl bg-[#ccff00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Re-Arm Gate Sensor Now</span>
              </button>
            </div>
          </div>
        )}

        {/* Live Line Adjustment Controls at bottom */}
        {isCameraStarted && !isGateFrozen && (
          <div className="absolute bottom-6 left-4 right-4 z-20 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-1.5 rounded-2xl bg-black/80 border border-white/15 p-1.5 backdrop-blur-md">
              <button
                onClick={() => nudgeLine(-0.02)}
                className="rounded-xl bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-xs font-mono font-bold text-white active:scale-95"
              >
                ◄ Nudge Left
              </button>
              <button
                onClick={() => nudgeLine(0.02)}
                className="rounded-xl bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-xs font-mono font-bold text-white active:scale-95"
              >
                Nudge Right ►
              </button>
            </div>

            <div className="rounded-2xl bg-black/80 border border-white/15 px-3 py-1.5 text-[11px] font-mono text-zinc-300 backdrop-blur-md flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${isTorsoDetected ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
              <span>{isTorsoDetected ? "Torso Locked" : "Watching Line"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Top Sensor HUD Bar (Active when camera is running) */}
      {isCameraStarted && (
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
              <span className="uppercase">{myZone.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Pause / Standby Button */}
            <button
              onClick={stopCameraStream}
              title="Pause camera sensor"
              className="flex items-center gap-1 rounded-xl border border-white/15 bg-zinc-900/80 px-2.5 py-1 text-xs font-mono text-zinc-300 backdrop-blur-md active:scale-95 transition-all"
            >
              <Pause className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Standby</span>
            </button>

            {/* Flip Camera */}
            {availableCameras.length > 1 && (
              <button
                onClick={flipCamera}
                className="rounded-xl border border-white/15 bg-zinc-900/80 p-1.5 text-zinc-300 backdrop-blur-md active:scale-95 transition-all"
              >
                <SwitchCamera className="h-4 w-4" />
              </button>
            )}

            {/* Sync Status Pill */}
            <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-zinc-900/80 px-2.5 py-1 text-[11px] font-mono text-zinc-300 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>SYNC ±{Math.abs(clockOffsetMs).toFixed(1)}ms</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. DEDICATED GATE STANDBY SCREEN OVERLAY (Shown when camera is not started yet) */}
      {!isCameraStarted && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#090a0d] text-white p-4 sm:p-6 select-none overflow-y-auto">
          {/* Top Mini Bar */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
            <button
              onClick={onSwitchToConsole}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white active:scale-95 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Switch to Console</span>
            </button>

            <div className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-zinc-900 px-3 py-1.5 text-xs font-mono text-zinc-300">
              <Wifi className="h-3.5 w-3.5 text-[#ccff00]" />
              <span>SESSION {sessionId}</span>
            </div>
          </div>

          {/* Center Standby Card */}
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-zinc-950 p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center space-y-4 sm:space-y-6 my-auto">
            {/* Gate Role Icon */}
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-[#ccff00]/15 border border-[#ccff00]/40 text-[#ccff00] shadow-[0_0_30px_rgba(204,255,0,0.2)]">
              {gateType === "start" ? (
                <Zap className="h-10 w-10" />
              ) : gateType === "split" ? (
                <Clock className="h-10 w-10" />
              ) : (
                <Flag className="h-10 w-10" />
              )}
            </div>

            <div>
              <div className="inline-flex items-center gap-1 rounded-full border border-[#ccff00]/40 bg-[#ccff00]/10 px-3 py-0.5 text-xs font-mono font-bold text-[#ccff00] mb-2 uppercase">
                Dedicated Gate Sensor Mode
              </div>
              <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
                {gateType === "start"
                  ? "Start Gate Sensor"
                  : gateType === "split"
                  ? "Flying Split Sensor"
                  : "Finish Line Gate Sensor"}
              </h2>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm font-sans">
                Position this phone on a tripod facing the track line. Only a solid human body crossing the laser beam will trigger timing.
              </p>
            </div>

            {/* Camera Selection */}
            {availableCameras.length > 1 && (
              <div className="w-full text-left space-y-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400">
                  Select Camera Sensor:
                </label>
                <select
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className="w-full rounded-xl bg-zinc-900 border border-white/15 px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#ccff00]"
                >
                  {availableCameras.map((c, i) => (
                    <option key={c.deviceId} value={c.deviceId}>
                      {c.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {cameraError && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300 font-mono flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* Big Prominent Activation Button */}
            <button
              onClick={() => startCamera()}
              disabled={isStarting}
              className="w-full py-4 sm:py-5 rounded-2xl bg-[#ccff00] hover:bg-[#b8e600] text-black font-black text-sm sm:text-base tracking-wider uppercase shadow-[0_0_30px_rgba(204,255,0,0.35)] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Camera className="h-5 w-5" />
              <span>{isStarting ? "Starting Camera Sensor..." : "Turn On Gate Camera"}</span>
            </button>

            <div className="text-[11px] font-mono text-zinc-500">
              Console Device: <strong className="text-zinc-300">Ready to receive breaks</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
