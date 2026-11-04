"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Timer,
  Play,
  Square,
  RotateCcw,
  Flag,
  Award,
  Zap,
  Radio,
  Camera,
  Activity,
  ChevronRight,
  ShieldCheck,
  SwitchCamera,
  Sliders,
  Eye,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  Session,
  SessionStatus,
  TimingResult,
  SplitRecord,
  LapRecord,
  ConnectedDevice,
  DetectionZone,
  TimingEvent,
  HardwareMetrics,
} from "@/types";
import { TimingEngine } from "@/lib/timing/timingEngine";
import { CameraManager } from "@/lib/vision/cameraManager";
import { TorsoTracker, TorsoLandmarkData } from "@/lib/vision/torsoTracker";
import { LineCrossingDetector } from "@/lib/vision/lineCrossingDetector";

interface LiveConsoleViewProps {
  session: Session;
  timingEngine: TimingEngine;
  connectedDevices: ConnectedDevice[];
  zones: DetectionZone[];
  onUpdateZones: (zones: DetectionZone[]) => void;
  sessionId: string;
  deviceId: string;
  deviceName: string;
  clockOffsetMs: number;
  onTimingEventDetected: (event: TimingEvent) => void;
  onOpenResults: (result: TimingResult) => void;
  onOpenStudio: () => void;
  onManualTrigger: (type: "ARM" | "START" | "STOP") => void;
}

export const LiveConsoleView: React.FC<LiveConsoleViewProps> = ({
  session,
  timingEngine,
  connectedDevices,
  zones,
  onUpdateZones,
  sessionId,
  deviceId,
  deviceName,
  clockOffsetMs,
  onTimingEventDetected,
  onOpenResults,
  onOpenStudio,
  onManualTrigger,
}) => {
  // Timing engine reactive states
  const [status, setStatus] = useState<SessionStatus>(timingEngine.getStatus());
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [splits, setSplits] = useState<SplitRecord[]>(timingEngine.getSplits());
  const [laps, setLaps] = useState<LapRecord[]>(timingEngine.getLaps());
  const [currentResult, setCurrentResult] = useState<TimingResult | null>(null);

  // Hold & Release button state
  const [isHoldingStart, setIsHoldingStart] = useState<boolean>(false);
  const holdStartTimeRef = useRef<number>(0);

  // Camera & Vision references
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraManager] = useState(() => new CameraManager());
  const [torsoTracker] = useState(() => new TorsoTracker());
  const [lineDetector] = useState(() => new LineCrossingDetector());

  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Visual feedback states
  const [isTorsoDetected, setIsTorsoDetected] = useState<boolean>(false);
  const [isTorsoTouchingGate, setIsTorsoTouchingGate] = useState<boolean>(false);
  const [gateTriggeredFlash, setGateTriggeredFlash] = useState<boolean>(false);
  const [freezeFrameSnapshot, setFreezeFrameSnapshot] = useState<string | null>(null);
  const [showFreezeFrame, setShowFreezeFrame] = useState<boolean>(false);

  // Line drag state on canvas
  const [isDraggingLine, setIsDraggingLine] = useState<boolean>(false);
  const zonesRef = useRef<DetectionZone[]>(zones);
  zonesRef.current = zones;

  const statusRef = useRef<SessionStatus>(status);
  statusRef.current = status;

  // Camera performance metrics
  const [metrics, setMetrics] = useState<HardwareMetrics>({
    cameraFps: 60,
    processingFps: 60,
    droppedFrames: 0,
    frameLatencyMs: 16.6,
    resolution: { width: 1280, height: 720 },
  });

  // Haptic feedback trigger
  const triggerHaptic = (pattern: number | number[]) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  };

  // High-frequency animation frame loop for chronograph
  useEffect(() => {
    let animId: number;
    const updateLoop = () => {
      const liveStatus = timingEngine.getStatus();
      setStatus(liveStatus);
      setElapsedMs(timingEngine.getLiveElapsedMs());
      setSplits(timingEngine.getSplits());
      setLaps(timingEngine.getLaps());
      animId = requestAnimationFrame(updateLoop);
    };
    animId = requestAnimationFrame(updateLoop);

    const unsubscribe = timingEngine.subscribe({
      onStatusChange: (s) => {
        setStatus(s);
        if (s === "finished") {
          setShowFreezeFrame(true);
        }
      },
      onResultGenerated: (res) => {
        setCurrentResult(res);
        if (res.videoEvidence?.finishFrame) {
          setFreezeFrameSnapshot(res.videoEvidence.finishFrame);
          setShowFreezeFrame(true);
        }
        triggerHaptic([100, 50, 150]);
      },
    });

    return () => {
      cancelAnimationFrame(animId);
      unsubscribe();
    };
  }, [timingEngine]);

  // Mount and initialize Live Camera
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

    startCameraStream();

    return () => {
      mounted = false;
      cameraManager.stopCamera();
    };
  }, []);

  const startCameraStream = async (camId?: string) => {
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
        processCameraFrame(video, frameTime);
      });
    } catch (err: any) {
      console.warn("Live Console camera start note:", err?.message || err);
      setCameraError(err?.message || "Camera sensor access needed");
      setIsCameraActive(false);
    }
  };

  const handleFlipCamera = () => {
    if (availableCameras.length <= 1) return;
    const currentIndex = availableCameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCam = availableCameras[nextIndex];
    setSelectedCameraId(nextCam.deviceId);
    startCameraStream(nextCam.deviceId);
    triggerHaptic(25);
  };

  // Continuous Camera Vision Loop
  const processCameraFrame = useCallback(
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

      // 1. Optical Torso Tracking
      const torso = torsoTracker.trackFrame(video, frameTime);
      setIsTorsoDetected(!!torso);

      const activeZones = zonesRef.current;
      const currentTimingStatus = statusRef.current;

      // 2. Draw Virtual Gates (Finish / Split / Start)
      let touchingNow = false;

      for (const zone of activeZones) {
        if (!zone.active) continue;

        const x1 = zone.lineCoordinates.x1 * canvas.width;
        const y1 = zone.lineCoordinates.y1 * canvas.height;
        const x2 = zone.lineCoordinates.x2 * canvas.width;
        const y2 = zone.lineCoordinates.y2 * canvas.height;

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        // Check if torso is currently touching this line
        let isTouching = false;
        if (torso) {
          const torsoMinX = torso.boundingBox.x * canvas.width;
          const torsoMaxX = (torso.boundingBox.x + torso.boundingBox.width) * canvas.width;
          const torsoCenterX = torso.torsoCenter.x * canvas.width;
          isTouching =
            (midX >= torsoMinX && midX <= torsoMaxX) ||
            Math.abs(torsoCenterX - midX) <= canvas.width * 0.05;

          if (isTouching) {
            touchingNow = true;
          }
        }

        ctx.save();
        // Dynamic Gate Styling (Glows White-Lime when touched)
        ctx.strokeStyle = isTouching ? "#ffffff" : zone.color || "#ccff00";
        ctx.lineWidth = isTouching ? 6 : 3.5;
        ctx.shadowColor = isTouching ? "#ffffff" : zone.color || "#ccff00";
        ctx.shadowBlur = isTouching ? 18 : 8;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Direction indicator chevron
        ctx.fillStyle = isTouching ? "#ffffff" : zone.color || "#ccff00";
        ctx.beginPath();
        if (zone.detectionDirection === "left_to_right") {
          ctx.moveTo(midX - 12, midY - 10);
          ctx.lineTo(midX + 12, midY);
          ctx.lineTo(midX - 12, midY + 10);
        } else if (zone.detectionDirection === "right_to_left") {
          ctx.moveTo(midX + 12, midY - 10);
          ctx.lineTo(midX - 12, midY);
          ctx.lineTo(midX + 12, midY + 10);
        } else {
          // Bidirectional circle marker
          ctx.arc(midX, midY, 8, 0, 2 * Math.PI);
        }
        ctx.fill();

        // Zone Tag Label
        ctx.fillStyle = isTouching ? "rgba(255, 255, 255, 0.95)" : "rgba(10, 12, 15, 0.88)";
        ctx.strokeStyle = zone.color || "#ccff00";
        ctx.lineWidth = 1;
        ctx.fillRect(midX - 52, y1 + 10, 104, 24);
        ctx.strokeRect(midX - 52, y1 + 10, 104, 24);

        ctx.font = "bold 11px -apple-system, sans-serif";
        ctx.fillStyle = isTouching ? "#0a0c0f" : zone.color || "#ccff00";
        ctx.textAlign = "center";
        ctx.fillText(
          isTouching ? `TOUCHING ${zone.name.toUpperCase()}` : zone.name.toUpperCase(),
          midX,
          y1 + 26
        );
        ctx.restore();
      }

      setIsTorsoTouchingGate(touchingNow);

      // 3. Render Torso Centroid & Bounding Box
      if (torso) {
        const tx = torso.torsoCenter.x * canvas.width;
        const ty = torso.torsoCenter.y * canvas.height;

        ctx.save();
        // Bounding Box
        ctx.strokeStyle = touchingNow
          ? "rgba(255, 255, 255, 0.9)"
          : "rgba(204, 255, 0, 0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(
          torso.boundingBox.x * canvas.width,
          torso.boundingBox.y * canvas.height,
          torso.boundingBox.width * canvas.width,
          torso.boundingBox.height * canvas.height
        );

        // Torso Target Reticle
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(tx, ty, 18, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = touchingNow ? "#ffffff" : "#ccff00";
        ctx.beginPath();
        ctx.arc(tx, ty, 6, 0, 2 * Math.PI);
        ctx.fill();

        // Label Tag
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#000000";
        ctx.shadowBlur = 4;
        ctx.fillText(
          `TORSO [${Math.round(torso.confidence * 100)}%]`,
          tx + 22,
          ty + 4
        );
        ctx.restore();

        // 4. Evaluate Crossing / Touch Events
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
            // Flash on trigger
            setGateTriggeredFlash(true);
            setTimeout(() => setGateTriggeredFlash(false), 900);

            setFreezeFrameSnapshot(c.frameSnapshot);

            // Forward event to timing engine & network mesh
            onTimingEventDetected(c.event);
            triggerHaptic([60, 40, 100]);
          }
        }
      }

      setMetrics(cameraManager.getMetrics());
    },
    [
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

  // Line Dragging Interactions directly on Live Console Video Canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;

    for (const zone of zones) {
      const lineX = (zone.lineCoordinates.x1 + zone.lineCoordinates.x2) / 2;
      if (Math.abs(clickX - lineX) < 0.15) {
        setIsDraggingLine(true);
        break;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingLine || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const newX = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));

    const updated = zones.map((z) => {
      if (z.zoneType === "finish") {
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
    if (isDraggingLine) {
      setIsDraggingLine(false);
      triggerHaptic(20);
    }
  };

  // Quick Nudge Line Position Buttons
  const nudgeLine = (delta: number) => {
    const updated = zones.map((z) => {
      if (z.zoneType === "finish") {
        const curX = (z.lineCoordinates.x1 + z.lineCoordinates.x2) / 2;
        const newX = Math.max(0.05, Math.min(0.95, curX + delta));
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
    triggerHaptic(15);
  };

  // Handle pointer interactions for Method A (Hold & Release)
  const handleStartPointerDown = (e: React.PointerEvent) => {
    if (status === "running") return;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    setIsHoldingStart(true);
    holdStartTimeRef.current = performance.now();
    timingEngine.arm();
    onManualTrigger("ARM");
    triggerHaptic(30);
  };

  const handleStartPointerUp = (e: React.PointerEvent) => {
    if (!isHoldingStart) return;
    setIsHoldingStart(false);

    const holdDuration = performance.now() - holdStartTimeRef.current;
    if (holdDuration < 180) {
      timingEngine.disarm();
      return;
    }

    if (status === "armed" || status === "idle") {
      const releaseTime = performance.now();
      lineDetector.reset(); // clear any residual detector cooldown
      setShowFreezeFrame(false);
      timingEngine.manualOverride("START", releaseTime);
      onManualTrigger("START");
      triggerHaptic([60, 40, 100]);
    }
  };

  // Instant 1-tap start for quick testing or solo athletics
  const handleQuickTapStart = () => {
    if (status === "running") return;
    lineDetector.reset();
    setShowFreezeFrame(false);
    timingEngine.manualOverride("START", performance.now());
    onManualTrigger("START");
    triggerHaptic([60, 40, 100]);
  };

  const handleStopOrOverride = () => {
    if (status === "running") {
      timingEngine.manualOverride("FINISH");
      onManualTrigger("STOP");
      triggerHaptic(80);
    }
  };

  const handleManualSplit = () => {
    if (status === "running") {
      timingEngine.manualOverride("SPLIT");
      triggerHaptic(40);
    }
  };

  const handleReset = () => {
    timingEngine.reset();
    lineDetector.reset();
    setCurrentResult(null);
    setElapsedMs(0);
    setSplits([]);
    setLaps([]);
    setShowFreezeFrame(false);
    triggerHaptic(20);
  };

  // Format Elapsed Milliseconds
  const formatTime = (ms: number) => {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor(ms % 1000);

    const mm = minutes > 0 ? `${minutes.toString().padStart(2, "0")}:` : "";
    const ss = seconds.toString().padStart(2, "0");
    const mmm = milliseconds.toString().padStart(3, "0");

    return { mm, ss, mmm };
  };

  const { mm, ss, mmm } = formatTime(elapsedMs);

  const getStatusBadge = () => {
    switch (status) {
      case "armed":
        return {
          bg: "bg-amber-950/80 border-amber-500/50 text-amber-300",
          label: "ARMED // RELEASE TO FIRE",
          pulse: true,
        };
      case "running":
        return {
          bg: "bg-[#ccff00]/15 border-[#ccff00]/50 text-[#ccff00]",
          label: isTorsoTouchingGate ? "TOUCH DETECTED!" : "TIMING RUNNING // GATE ARMED",
          pulse: true,
        };
      case "split_detected":
        return {
          bg: "bg-cyan-950/80 border-cyan-500/50 text-cyan-300",
          label: "SPLIT GATE TRIGGERED",
          pulse: false,
        };
      case "finished":
        return {
          bg: "bg-emerald-950/80 border-emerald-500/50 text-emerald-300",
          label: "STOPPED BY CAMERA GATE",
          pulse: false,
        };
      default:
        return {
          bg: "bg-zinc-900 border-white/10 text-zinc-400",
          label:
            session.startMethod === "hold_and_release"
              ? "READY // PRESS & HOLD START"
              : "READY // CAMERA AUTO START",
          pulse: false,
        };
    }
  };

  const statusBadge = getStatusBadge();
  const finishZone = zones.find((z) => z.zoneType === "finish") || zones[0];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0c0f] p-2.5 sm:p-5 max-w-7xl mx-auto w-full overflow-y-auto no-overscroll pb-24 md:pb-8">
      {/* Top Session Telemetry Bar */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-zinc-950/90 p-3 sm:p-4 shadow-xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-zinc-900 border border-white/15 text-[#ccff00] flex-shrink-0">
            <Activity className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm sm:text-base font-black tracking-wide text-white truncate">
                {session.athleteName}
              </h2>
              {session.distanceMeters && (
                <span className="rounded bg-[#ccff00]/15 border border-[#ccff00]/30 px-1.5 py-0.2 text-[9px] font-mono font-bold text-[#ccff00] flex-shrink-0">
                  {session.distanceMeters}M
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 truncate font-medium">
              {session.eventName}
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div
          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[10px] sm:text-xs font-mono font-bold tracking-wider flex-shrink-0 ${
            statusBadge.bg
          } ${statusBadge.pulse ? "animate-pulse" : ""}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          <span>{statusBadge.label}</span>
        </div>
      </div>

      {/* Main Grid: Live Camera Gate + Digital Chronograph */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 my-3 sm:my-5 items-stretch">
        {/* Left Column (Lg 7 cols): Live Camera Viewport with Virtual Finish Gate */}
        <div
          className={`lg:col-span-7 rounded-3xl border relative overflow-hidden bg-black shadow-2xl flex flex-col justify-between transition-all duration-300 ${
            gateTriggeredFlash
              ? "border-white ring-4 ring-[#ccff00] shadow-[0_0_50px_rgba(204,255,0,0.6)]"
              : isTorsoTouchingGate
              ? "border-[#ccff00] shadow-[0_0_30px_rgba(204,255,0,0.3)]"
              : "border-white/15"
          }`}
          style={{ minHeight: "280px" }}
        >
          {/* Top Camera Status Header */}
          <div className="relative z-20 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider backdrop-blur-md ${
                  isCameraActive
                    ? "border-emerald-500/50 bg-emerald-950/70 text-emerald-300"
                    : "border-red-500/50 bg-red-950/70 text-red-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isCameraActive ? "bg-emerald-400 animate-pulse" : "bg-red-500"
                  }`}
                />
                <span>
                  {showFreezeFrame
                    ? "PHOTO-FINISH EVIDENCE"
                    : isCameraActive
                    ? "OPTICAL GATE LIVE"
                    : "CAMERA OFFLINE"}
                </span>
              </div>

              {isTorsoDetected && !showFreezeFrame && (
                <div
                  className={`rounded-lg border px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider backdrop-blur-md transition-colors ${
                    isTorsoTouchingGate
                      ? "border-[#ccff00] bg-[#ccff00] text-black animate-pulse"
                      : "border-white/20 bg-zinc-900/80 text-white"
                  }`}
                >
                  {isTorsoTouchingGate ? "TOUCHING GATE" : "TORSO DETECTED"}
                </div>
              )}
            </div>

            {/* Camera Actions */}
            <div className="flex items-center gap-1.5">
              {availableCameras.length > 1 && (
                <button
                  onClick={handleFlipCamera}
                  className="rounded-lg border border-white/20 bg-zinc-900/80 p-1.5 text-zinc-300 hover:text-white backdrop-blur-md active:scale-95 transition-all"
                  title="Flip Camera (Front/Rear)"
                >
                  <SwitchCamera className="h-4 w-4" />
                </button>
              )}
              {freezeFrameSnapshot && (
                <button
                  onClick={() => setShowFreezeFrame(!showFreezeFrame)}
                  className={`rounded-lg border px-2 py-1 text-[10px] font-mono font-bold backdrop-blur-md active:scale-95 transition-all ${
                    showFreezeFrame
                      ? "border-[#ccff00] bg-[#ccff00]/20 text-[#ccff00]"
                      : "border-white/20 bg-zinc-900/80 text-zinc-300"
                  }`}
                >
                  {showFreezeFrame ? "View Live Cam" : "View Photo Finish"}
                </button>
              )}
            </div>
          </div>

          {/* Video & Canvas Container */}
          <div className="relative flex-1 w-full min-h-[220px] sm:min-h-[260px] flex items-center justify-center bg-zinc-950">
            {/* Live Video Feed */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`w-full h-full object-cover select-none ${
                showFreezeFrame && freezeFrameSnapshot ? "hidden" : "block"
              }`}
            />

            {/* Overlay Canvas for Virtual Timing Line & Torso Reticle */}
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className={`absolute inset-0 w-full h-full object-cover touch-none cursor-ew-resize select-none ${
                showFreezeFrame && freezeFrameSnapshot ? "hidden" : "block"
              }`}
            />

            {/* Freeze-Frame Photo-Finish Display on Stop */}
            {showFreezeFrame && freezeFrameSnapshot && (
              <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-black select-none">
                <img
                  src={freezeFrameSnapshot}
                  alt="Photo-Finish Freeze Frame"
                  className="w-full h-full object-contain"
                />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl border border-emerald-500/50 bg-emerald-950/80 p-2.5 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-[11px] font-mono text-emerald-200 font-bold">
                      OFFICIAL TORSO CROSSING CAPTURED
                    </span>
                  </div>
                  <button
                    onClick={() => setShowFreezeFrame(false)}
                    className="rounded-lg bg-white text-black px-2.5 py-1 text-[10px] font-bold"
                  >
                    Resume Live Feed
                  </button>
                </div>
              </div>
            )}

            {/* Error or Fallback Message */}
            {cameraError && !isCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-zinc-950/90 z-10">
                <AlertCircle className="h-8 w-8 text-amber-400 mb-2" />
                <h4 className="text-sm font-bold text-white mb-1">
                  Camera Sensor Initialization
                </h4>
                <p className="text-xs text-zinc-400 max-w-sm mb-3">
                  Please grant camera permissions to enable automatic torso touch detection.
                </p>
                <button
                  onClick={() => startCameraStream()}
                  className="rounded-xl border border-[#ccff00]/40 bg-[#ccff00]/15 px-4 py-2 text-xs font-bold text-[#ccff00] hover:bg-[#ccff00]/25 transition-all"
                >
                  Retry Camera Connection
                </button>
              </div>
            )}
          </div>

          {/* Bottom Camera Toolbar: Quick Nudge Line Position */}
          <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 p-2.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent border-t border-white/10 text-[10px] font-mono">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Sliders className="h-3.5 w-3.5 text-[#ccff00]" />
              <span className="text-white font-bold">GATE POSITION:</span>
              <span className="text-[#ccff00]">
                {Math.round(
                  (((finishZone?.lineCoordinates.x1 || 0.5) +
                    (finishZone?.lineCoordinates.x2 || 0.5)) /
                    2) *
                    100
                )}
                %
              </span>
            </div>

            {/* Line Position Nudge Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => nudgeLine(-0.04)}
                className="rounded-lg border border-white/15 bg-zinc-900/90 px-2 py-1 text-zinc-300 hover:text-white active:scale-95 transition-all"
                title="Move Gate Left"
              >
                ◀ Left
              </button>
              <button
                onClick={() => nudgeLine(0.04)}
                className="rounded-lg border border-white/15 bg-zinc-900/90 px-2 py-1 text-zinc-300 hover:text-white active:scale-95 transition-all"
                title="Move Gate Right"
              >
                Right ▶
              </button>
              <button
                onClick={onOpenStudio}
                className="rounded-lg border border-[#ccff00]/30 bg-[#ccff00]/10 px-2.5 py-1 text-[#ccff00] font-bold active:scale-95 transition-all"
              >
                Full Studio
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (Lg 5 cols): Chronograph Display & Start/Stop Controls */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-3 sm:gap-4">
          {/* Main Digital Chronograph Panel */}
          <div className="flex-1 rounded-3xl border border-white/15 bg-gradient-to-b from-[#13171e] to-[#0c0e12] p-4 sm:p-6 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
            {/* Digital Numbers */}
            <div className="relative z-10 flex items-baseline justify-center font-mono font-black tracking-tighter select-none py-2 sm:py-4">
              {mm && (
                <span className="text-3xl xs:text-4xl sm:text-6xl text-zinc-400">
                  {mm}
                </span>
              )}
              <span className="text-5xl xs:text-6xl sm:text-7xl md:text-8xl text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.15)] font-mono-numbers">
                {ss}
              </span>
              <span className="text-3xl xs:text-4xl sm:text-5xl md:text-6xl text-[#ccff00] ml-1 drop-shadow-[0_0_20px_rgba(204,255,0,0.3)] font-mono-numbers">
                .{mmm}
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-zinc-500 ml-1.5 uppercase tracking-widest font-sans">
                S
              </span>
            </div>

            {/* Telemetry Sub-bar */}
            <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 sm:gap-5 text-[10px] sm:text-xs font-mono text-zinc-400 mt-1">
              <div>
                <span>SPLITS: </span>
                <span className="font-bold text-white">{splits.length}</span>
              </div>
              {session.targetLaps && session.targetLaps > 0 ? (
                <div>
                  <span>LAP: </span>
                  <span className="font-bold text-[#ccff00]">
                    {timingEngine.getCurrentLap()}/{session.targetLaps}
                  </span>
                </div>
              ) : null}
              <div>
                <span>FPS: </span>
                <span className="font-bold text-emerald-400">
                  {metrics.processingFps || 60}
                </span>
              </div>
            </div>

            {/* Finished Result Banner */}
            {status === "finished" && currentResult && (
              <div className="relative z-10 mt-3 sm:mt-4 w-full flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/80 p-3 sm:p-4 shadow-xl">
                <div className="flex items-center gap-2.5">
                  <Award className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-400 flex-shrink-0" />
                  <div>
                    <div className="text-[9px] sm:text-[10px] font-mono text-emerald-300 uppercase tracking-wider font-bold">
                      Stop Confirmed • Camera Gate
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-white">
                      {(currentResult.totalTimeMs / 1000).toFixed(3)}s
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-zinc-300 font-mono">
                      ±{currentResult.uncertaintyMs}ms • {currentResult.timingQuality}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onOpenResults(currentResult)}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-white text-black px-3.5 py-1.5 text-xs font-bold shadow-lg hover:bg-zinc-200 active:scale-95 transition-all"
                >
                  Inspect Evidence
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Timing Trigger Controls (Hold & Release or Camera Auto) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {session.startMethod === "hold_and_release" ? (
              <>
                <button
                  onPointerDown={handleStartPointerDown}
                  onPointerUp={handleStartPointerUp}
                  disabled={status === "running"}
                  className={`relative flex flex-col items-center justify-center rounded-2xl border p-4 sm:p-5 select-none transition-all touch-none min-h-[85px] sm:min-h-[100px] ${
                    isHoldingStart
                      ? "border-amber-400 bg-amber-500/25 shadow-[0_0_35px_rgba(245,158,11,0.35)] scale-[0.98]"
                      : status === "running"
                      ? "border-white/10 bg-zinc-950/40 opacity-40 cursor-not-allowed"
                      : "border-[#ccff00]/60 bg-[#ccff00]/15 hover:bg-[#ccff00]/25 shadow-[0_0_20px_rgba(204,255,0,0.15)] active:scale-[0.98]"
                  }`}
                >
                  <Zap
                    className={`h-6 w-6 mb-1 ${
                      isHoldingStart ? "text-amber-400 animate-bounce" : "text-[#ccff00]"
                    }`}
                  />
                  <span className="text-xs sm:text-sm font-black tracking-wider text-white uppercase text-center">
                    {isHoldingStart ? "RELEASE TO START" : "HOLD & RELEASE START"}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400 mt-0.5">
                    {isHoldingStart ? "Hold firmly until athlete starts" : "Hold thumb to arm"}
                  </span>
                </button>

                {/* 1-Tap Quick Start Option for Solo Training */}
                <button
                  onClick={handleQuickTapStart}
                  disabled={status === "running"}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-4 select-none transition-all min-h-[85px] sm:min-h-[100px] ${
                    status === "running"
                      ? "border-white/10 bg-zinc-950/40 opacity-40 cursor-not-allowed"
                      : "border-white/15 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 active:scale-95"
                  }`}
                >
                  <Play className="h-5 w-5 mb-1 text-white" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    1-Tap Quick Start
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400 mt-0.5">
                    Tap to run instantly
                  </span>
                </button>
              </>
            ) : (
              <div className="col-span-1 sm:col-span-2 rounded-2xl border border-white/10 bg-zinc-950 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-xl bg-[#ccff00]/10 p-2 text-[#ccff00]">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Optical Start & Finish Armed
                    </h4>
                    <p className="text-[10px] text-zinc-400">
                      Timer automatically starts & stops on camera gate.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleQuickTapStart}
                  disabled={status === "running"}
                  className="rounded-xl border border-white/15 bg-zinc-900 px-3 py-1.5 text-[11px] font-bold text-white active:scale-95 transition-all"
                >
                  Manual Start
                </button>
              </div>
            )}
          </div>

          {/* Action Row: Stop Sprint (Manual Override) or New Attempt */}
          <div className="flex gap-2">
            {status === "running" ? (
              <>
                <button
                  onClick={handleStopOrOverride}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-red-500/50 bg-red-950/70 p-3 sm:p-4 text-xs sm:text-sm font-bold text-red-300 active:scale-95 shadow-lg transition-all"
                >
                  <Square className="h-4 w-4" />
                  Manual Stop
                </button>
                <button
                  onClick={handleManualSplit}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-zinc-900 p-3 sm:p-4 text-xs font-bold text-zinc-200 active:scale-95 transition-all"
                >
                  <Flag className="h-4 w-4 text-[#ccff00]" />
                  Split
                </button>
              </>
            ) : (
              <button
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-zinc-950 p-3.5 sm:p-4 text-zinc-300 hover:text-white active:scale-95 transition-all shadow-lg"
              >
                <RotateCcw className="h-4 w-4 text-[#ccff00]" />
                <span className="text-xs font-black uppercase tracking-wider">
                  New Attempt // Reset Clock
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Splits Table with Sub-Frame Photo Thumbnails */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-3 sm:p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5 text-[#ccff00]" />
            Split Gates ({splits.length})
          </h3>
          <span className="text-[10px] font-mono text-zinc-500">
            Automatic Photo-Finish Verification
          </span>
        </div>

        {splits.length === 0 ? (
          <div className="py-5 text-center text-xs font-mono text-zinc-500">
            No gates crossed yet. Detected splits will appear with photo evidence.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[9px] text-zinc-400 uppercase">
                  <th className="pb-1.5">#</th>
                  <th className="pb-1.5">Gate</th>
                  <th className="pb-1.5">Interval</th>
                  <th className="pb-1.5">Cumulative</th>
                  <th className="pb-1.5">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {splits.map((s) => (
                  <tr key={s.index}>
                    <td className="py-2 font-bold text-[#ccff00]">#{s.index}</td>
                    <td className="py-2 text-white font-sans font-medium text-[11px] truncate max-w-[90px]">
                      {s.name}
                    </td>
                    <td className="py-2 text-zinc-300 font-bold">
                      {(s.splitTimeMs / 1000).toFixed(3)}s
                    </td>
                    <td className="py-2 text-white font-bold">
                      {(s.elapsedMs / 1000).toFixed(3)}s
                    </td>
                    <td className="py-2">
                      {s.frameReference ? (
                        <img
                          src={s.frameReference}
                          alt="Evidence"
                          className="h-7 w-12 object-cover rounded border border-white/10 cursor-pointer hover:scale-110 transition-transform"
                          onClick={() => {
                            setFreezeFrameSnapshot(s.frameReference || null);
                            setShowFreezeFrame(true);
                          }}
                        />
                      ) : (
                        <span className="text-zinc-600 text-[9px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
