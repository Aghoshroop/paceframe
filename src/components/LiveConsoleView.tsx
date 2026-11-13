"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Timer,
  Play,
  Square,
  RotateCcw,
  Flag,
  Award,
  Zap,
  Clock,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Plus,
  Smartphone,
  Radio,
  Wifi,
} from "lucide-react";
import {
  Session,
  SessionStatus,
  TimingResult,
  SplitRecord,
  LapRecord,
  ConnectedDevice,
  DetectionZone,
  DeviceRole,
} from "@/types";
import { TimingEngine } from "@/lib/timing/timingEngine";
import { soundEngine } from "@/lib/audio/soundEngine";
import { getPreciseTime } from "@/lib/timing/clockSync";

interface LiveConsoleViewProps {
  session: Session;
  timingEngine: TimingEngine;
  connectedDevices: ConnectedDevice[];
  zones: DetectionZone[];
  deviceId?: string;
  onOpenResults: (result: TimingResult) => void;
  onOpenGateQR: (role: DeviceRole) => void;
  onManualTrigger: (type: "ARM" | "START" | "STOP") => void;
  onAssignDeviceRole?: (targetDeviceId: string, newRole: DeviceRole) => void;
  onResetSession?: () => void;
}

export const LiveConsoleView: React.FC<LiveConsoleViewProps> = ({
  session,
  timingEngine,
  connectedDevices,
  deviceId,
  onOpenResults,
  onOpenGateQR,
  onManualTrigger,
  onAssignDeviceRole,
  onResetSession,
}) => {
  // Timing engine reactive states
  const [status, setStatus] = useState<SessionStatus>(timingEngine.getStatus());
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [splits, setSplits] = useState<SplitRecord[]>(timingEngine.getSplits());
  const [laps, setLaps] = useState<LapRecord[]>(timingEngine.getLaps());
  const [currentResult, setCurrentResult] = useState<TimingResult | null>(null);

  // Live Beam Test Notification (shows when a runner crosses gate before pistol start)
  const [lastGateTest, setLastGateTest] = useState<{
    zoneType: string;
    deviceName: string;
    timestamp: number;
  } | null>(null);

  // Start Mode: starter pistol (hold & release), solo countdown, or 1-tap
  const [startMode, setStartMode] = useState<"hold_release" | "solo_countdown" | "instant">("hold_release");
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null);

  // Hold & Release button state
  const [isHoldingStart, setIsHoldingStart] = useState<boolean>(false);
  const holdStartTimeRef = useRef<number>(0);

  // Photo-Finish freeze frame modal view
  const [showPhotoModal, setShowPhotoModal] = useState<boolean>(false);

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
      setStatus(timingEngine.getStatus());
      setElapsedMs(timingEngine.getLiveElapsedMs());
      setSplits(timingEngine.getSplits());
      setLaps(timingEngine.getLaps());
      animId = requestAnimationFrame(updateLoop);
    };
    animId = requestAnimationFrame(updateLoop);

    const unsubscribe = timingEngine.subscribe({
      onStatusChange: (s) => setStatus(s),
      onResultGenerated: (res) => {
        setCurrentResult(res);
        triggerHaptic([120, 60, 180]);
      },
      onGateTestTriggered: (evt) => {
        setLastGateTest({
          zoneType: evt.eventType,
          deviceName: evt.deviceName || "Gate Sensor",
          timestamp: Date.now(),
        });
        triggerHaptic(60);
        setTimeout(() => setLastGateTest(null), 3500);
      },
    });

    return () => {
      cancelAnimationFrame(animId);
      unsubscribe();
    };
  }, [timingEngine]);

  // Connected gate devices filtering
  const remoteDevices = connectedDevices.filter(
    (d) => d.deviceId !== deviceId && !d.isAuthority && d.deviceRole !== "master_console"
  );

  const finishGateDevice =
    connectedDevices.find((d) => d.deviceId !== deviceId && d.deviceRole === "finish_camera") ||
    (remoteDevices.length > 0 && remoteDevices[0].deviceRole === "secondary_camera"
      ? remoteDevices[0]
      : undefined);

  const startGateDevice = connectedDevices.find(
    (d) => d.deviceId !== deviceId && d.deviceRole === "start_camera"
  );

  const splitGateDevice = connectedDevices.find(
    (d) => d.deviceId !== deviceId && d.deviceRole === "split_camera"
  );

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

  // --- START PROCEDURES ---

  // 1. Starter Pistol (Hold & Release)
  const handleStartPointerDown = (e: React.PointerEvent) => {
    if (status === "running") return;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    setIsHoldingStart(true);
    holdStartTimeRef.current = getPreciseTime();
    timingEngine.arm();
    onManualTrigger("ARM");
    triggerHaptic(30);
  };

  const handleStartPointerUp = (e: React.PointerEvent) => {
    if (!isHoldingStart) return;
    setIsHoldingStart(false);

    const holdDuration = getPreciseTime() - holdStartTimeRef.current;
    if (holdDuration < 160) {
      timingEngine.disarm();
      return;
    }

    if (status === "armed" || status === "idle") {
      const releaseTime = getPreciseTime();
      timingEngine.manualOverride("START", releaseTime);
      onManualTrigger("START");
      triggerHaptic([70, 40, 110]);
    }
  };

  // 2. Solo Countdown (3... 2... 1... GO!)
  const handleStartSoloCountdown = () => {
    if (status === "running" || countdownNumber !== null) return;
    timingEngine.arm();

    let count = 3;
    setCountdownNumber(count);
    soundEngine.playCountdownBeep(false);

    const intervalId = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownNumber(count);
        soundEngine.playCountdownBeep(false);
      } else {
        clearInterval(intervalId);
        setCountdownNumber(null);
        const startTime = getPreciseTime();
        timingEngine.manualOverride("START", startTime);
        onManualTrigger("START");
        soundEngine.playCountdownBeep(true);
        triggerHaptic([90, 50, 150]);
      }
    }, 1000);
  };

  // 3. Instant 1-Tap Start
  const handleInstantStart = () => {
    if (status === "running") return;
    const startTime = getPreciseTime();
    timingEngine.manualOverride("START", startTime);
    onManualTrigger("START");
    triggerHaptic(80);
  };

  // 4. Reset & Arm for Next Sprint (Signals all gate cameras to unfreeze and re-arm)
  const handleResetForNextSprint = () => {
    timingEngine.reset();
    setCurrentResult(null);
    setShowPhotoModal(false);
    onResetSession?.();
    triggerHaptic(40);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#090a0d] text-white p-3 sm:p-6 max-w-5xl mx-auto w-full overflow-y-auto pb-24 md:pb-8">
      {/* Top Session Breadcrumb */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ccff00]/15 text-[#ccff00]">
            <Timer className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-wide uppercase text-white">
              {session.sessionName}
            </h2>
            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
              <span>{session.distanceMeters}m SPRINT</span>
              <span>•</span>
              <span className="text-[#ccff00]">OPTICAL TORSO DETECTION</span>
            </div>
          </div>
        </div>

        <div className="text-xs font-mono text-zinc-400">
          ATHLETE: <strong className="text-white">{session.athleteName}</strong>
        </div>
      </div>

      {/* Beam Test Live Indicator (Banner when someone walks across beam) */}
      {lastGateTest && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-[#ccff00]/40 bg-[#ccff00]/15 px-3 py-2 text-xs font-mono text-[#ccff00] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 animate-bounce" />
            <span>
              <strong>Optical Beam Tested:</strong> {lastGateTest.deviceName} detected torso break & transmitted OK!
            </span>
          </div>
          <span className="text-[10px] text-zinc-300">Beam Active 🟢</span>
        </div>
      )}

      {/* Connected Gate Devices Section */}
      <div className="my-3 sm:my-4 rounded-2xl border border-white/10 bg-zinc-950 p-3 sm:p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5 text-[#ccff00]" />
            Camera Gate Pods ({remoteDevices.length} Connected)
          </span>
          <button
            onClick={() => onOpenGateQR("finish_camera")}
            className="text-[11px] font-mono font-bold text-[#ccff00] hover:underline flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            <span>Pair Another Phone (QR)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Finish Gate Pod */}
          <div className={`flex items-center justify-between rounded-xl border p-2.5 transition-all ${
            finishGateDevice
              ? "border-emerald-500/40 bg-emerald-950/20"
              : "border-white/10 bg-zinc-900/80"
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
                finishGateDevice ? "bg-emerald-500/20 text-emerald-400" : "bg-[#ccff00]/15 text-[#ccff00]"
              }`}>
                <Flag className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  Finish Line Gate
                </div>
                <div className="text-[10px] font-mono flex items-center gap-1.5">
                  {finishGateDevice ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-300 font-bold truncate">
                        {finishGateDevice.deviceName} (Ready)
                      </span>
                    </>
                  ) : (
                    <span className="text-amber-400 font-medium">Not Connected</span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => onOpenGateQR("finish_camera")}
              className="flex items-center gap-1 rounded-lg border border-[#ccff00]/40 bg-[#ccff00]/10 px-2.5 py-1.5 text-[11px] font-bold text-[#ccff00] hover:bg-[#ccff00]/20 active:scale-95 transition-all flex-shrink-0 ml-2"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>{finishGateDevice ? "Change Phone" : "Pair Phone (QR)"}</span>
            </button>
          </div>

          {/* Flying Split Gate Pod */}
          <div className={`flex items-center justify-between rounded-xl border p-2.5 transition-all ${
            splitGateDevice
              ? "border-cyan-500/40 bg-cyan-950/20"
              : "border-white/10 bg-zinc-900/80"
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
                splitGateDevice ? "bg-cyan-500/20 text-cyan-400" : "bg-zinc-800 text-zinc-400"
              }`}>
                <Clock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  Flying Split Gate
                </div>
                <div className="text-[10px] font-mono flex items-center gap-1.5">
                  {splitGateDevice ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="text-cyan-300 font-bold truncate">
                        {splitGateDevice.deviceName} (Ready)
                      </span>
                    </>
                  ) : (
                    <span className="text-zinc-500">Optional Gate</span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => onOpenGateQR("split_camera")}
              className="flex items-center gap-1 rounded-lg border border-white/15 bg-zinc-800 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:text-white active:scale-95 transition-all flex-shrink-0 ml-2"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{splitGateDevice ? "Change" : "Add Split"}</span>
            </button>
          </div>
        </div>

        {/* Detailed Remote Devices Roster (if secondary phones connected) */}
        {remoteDevices.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-white/10 space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
              Active Trackside Devices:
            </span>
            <div className="space-y-1">
              {remoteDevices.map((dev) => (
                <div
                  key={dev.deviceId}
                  className="flex items-center justify-between rounded-lg bg-zinc-900/90 px-2.5 py-1.5 text-xs border border-white/5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-bold text-white truncate">{dev.deviceName}</span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      (NTP ±{dev.syncQuality?.jitterMs || 0.5}ms)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {onAssignDeviceRole ? (
                      <select
                        value={dev.deviceRole}
                        onChange={(e) => onAssignDeviceRole(dev.deviceId, e.target.value as DeviceRole)}
                        className="rounded bg-zinc-800 border border-white/15 px-2 py-0.5 text-[11px] font-bold text-[#ccff00] focus:outline-none"
                      >
                        <option value="finish_camera">Finish Gate</option>
                        <option value="split_camera">Split Gate</option>
                        <option value="start_camera">Start Gate</option>
                      </select>
                    ) : (
                      <span className="text-[10px] font-bold uppercase text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded">
                        {dev.deviceRole.replace("_camera", " gate")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Minimalist Chronograph */}
      <div className="my-2 sm:my-3 rounded-3xl border border-white/15 bg-gradient-to-b from-[#11141c] to-[#0a0c10] p-6 sm:p-10 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
        {/* Status Pill */}
        <div className="mb-2">
          {status === "armed" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-950/70 px-3 py-1 text-xs font-mono font-bold text-amber-300 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {countdownNumber !== null ? `COUNTDOWN ${countdownNumber}s` : "SET // RELEASE TO START"}
            </span>
          ) : status === "running" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ccff00]/50 bg-[#ccff00]/15 px-3 py-1 text-xs font-mono font-bold text-[#ccff00] animate-pulse">
              <span className="h-2 w-2 rounded-full bg-[#ccff00]" />
              TIMING RUNNING // WAITING FOR FINISH GATE BREAK
            </span>
          ) : status === "finished" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-950/80 px-3 py-1 text-xs font-mono font-bold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              FINISHED // RECORDED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900 px-3 py-1 text-xs font-mono text-zinc-400">
              READY FOR SPRINT
            </span>
          )}
        </div>

        {/* Digital Numbers */}
        <div className="flex items-baseline justify-center font-mono font-black tracking-tighter select-none py-3 sm:py-6">
          {mm && (
            <span className="text-4xl xs:text-5xl sm:text-7xl md:text-8xl text-zinc-500">
              {mm}
            </span>
          )}
          <span className="text-6xl xs:text-7xl sm:text-8xl md:text-9xl text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.18)] font-mono-numbers">
            {ss}
          </span>
          <span className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl text-[#ccff00] ml-1 drop-shadow-[0_0_25px_rgba(204,255,0,0.35)] font-mono-numbers">
            .{mmm}
          </span>
          <span className="text-xs sm:text-sm font-bold text-zinc-500 ml-2 uppercase tracking-widest font-sans">
            S
          </span>
        </div>

        {/* Live Splits Display */}
        {splits.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            {splits.map((s) => (
              <div
                key={s.index || s.splitIndex || Math.random()}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1 text-xs font-mono text-cyan-300"
              >
                <Clock className="h-3 w-3" />
                <span>SPLIT {s.index || s.splitIndex}:</span>
                <strong className="text-white">{(s.elapsedMs / 1000).toFixed(3)}s</strong>
                {s.speedKmh && (
                  <span className="text-[#ccff00] font-bold">({s.speedKmh} km/h)</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post-Sprint Result Card & Photo-Finish Evidence */}
      {currentResult && status === "finished" && (
        <div className="my-3 sm:my-4 rounded-3xl border border-emerald-500/40 bg-zinc-950 p-4 sm:p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-[#ccff00]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Sprint Time Confirmed
              </h3>
            </div>
            <div className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 font-bold bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-500/40">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>VALIDATED PHOTO-FINISH</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
            <div className="rounded-xl border border-white/10 bg-zinc-900/90 p-3">
              <div className="text-[10px] font-mono uppercase text-zinc-400">OFFICIAL TIME</div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-[#ccff00] mt-0.5">
                {(currentResult.totalTimeMs / 1000).toFixed(3)}s
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-900/90 p-3">
              <div className="text-[10px] font-mono uppercase text-zinc-400">TOP VELOCITY</div>
              <div className="text-xl sm:text-2xl font-black font-mono text-white mt-1">
                {currentResult.speedKmh ? `${currentResult.speedKmh} km/h` : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-900/90 p-3">
              <div className="text-[10px] font-mono uppercase text-zinc-400">METERS / SEC</div>
              <div className="text-xl sm:text-2xl font-black font-mono text-cyan-300 mt-1">
                {currentResult.speedMs ? `${currentResult.speedMs} m/s` : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-900/90 p-3">
              <div className="text-[10px] font-mono uppercase text-zinc-400">UNCERTAINTY</div>
              <div className="text-xl sm:text-2xl font-black font-mono text-zinc-300 mt-1">
                ±{currentResult.uncertaintyMs}ms
              </div>
            </div>
          </div>

          {/* Photo-Finish Frame Preview */}
          {currentResult.videoEvidence?.finishFrame && (
            <div className="my-3 rounded-2xl overflow-hidden border border-white/20 bg-black relative">
              <div className="absolute top-2 left-2 z-10 rounded-md bg-black/80 px-2 py-1 text-[10px] font-mono text-[#ccff00] font-bold border border-white/15">
                PHOTO-FINISH PROOF (CHEST TORSO CROSSING)
              </div>
              <img
                src={currentResult.videoEvidence.finishFrame}
                alt="Photo finish proof"
                className="w-full max-h-56 object-contain mx-auto"
              />
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleResetForNextSprint}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-[#ccff00] hover:bg-[#b8e600] py-3.5 px-4 font-black text-sm text-black tracking-wide shadow-lg active:scale-95 transition-all"
            >
              <RotateCcw className="h-4 w-4" />
              <span>NEXT SPRINT (RE-ARM)</span>
            </button>
            <button
              onClick={() => onOpenResults(currentResult)}
              className="flex items-center gap-1.5 rounded-2xl border border-white/15 bg-zinc-900 hover:bg-zinc-800 py-3.5 px-4 text-xs font-bold text-white active:scale-95 transition-all"
            >
              <span>Full Analytics</span>
            </button>
          </div>
        </div>
      )}

      {/* Start Procedure Controllers (Visible when not running or when armed) */}
      {status !== "running" && status !== "finished" && (
        <div className="space-y-3 mt-2">
          {/* Mode Selector Tabs */}
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-zinc-950 p-1 border border-white/10 text-xs">
            <button
              onClick={() => setStartMode("hold_release")}
              className={`rounded-xl py-2 font-bold transition-all ${
                startMode === "hold_release"
                  ? "bg-[#ccff00] text-black shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Starter Gun
            </button>
            <button
              onClick={() => setStartMode("solo_countdown")}
              className={`rounded-xl py-2 font-bold transition-all ${
                startMode === "solo_countdown"
                  ? "bg-[#ccff00] text-black shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              3s Countdown
            </button>
            <button
              onClick={() => setStartMode("instant")}
              className={`rounded-xl py-2 font-bold transition-all ${
                startMode === "instant"
                  ? "bg-[#ccff00] text-black shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              1-Tap Start
            </button>
          </div>

          {/* Interactive Trigger Surface */}
          {startMode === "hold_release" && (
            <button
              onPointerDown={handleStartPointerDown}
              onPointerUp={handleStartPointerUp}
              onPointerCancel={handleStartPointerUp}
              className={`w-full py-8 sm:py-12 rounded-3xl font-black text-lg sm:text-2xl tracking-wider transition-all shadow-2xl flex flex-col items-center justify-center gap-2 select-none touch-none ${
                isHoldingStart
                  ? "bg-amber-400 text-black scale-[0.98] shadow-[0_0_50px_rgba(251,191,36,0.6)]"
                  : "bg-gradient-to-r from-emerald-500 via-[#ccff00] to-emerald-400 text-black hover:opacity-95 shadow-[0_0_40px_rgba(204,255,0,0.35)]"
              }`}
            >
              <Zap className="h-7 w-7 sm:h-9 sm:w-9" />
              <span>{isHoldingStart ? "READY... RELEASE TO GO!" : "HOLD TO ARM (STARTER PISTOL)"}</span>
              <span className="text-[11px] font-mono opacity-80 font-normal">
                {isHoldingStart ? "Athletes Set • Release triggers electronic gun" : "Press & hold thumb • Release on starter beep"}
              </span>
            </button>
          )}

          {startMode === "solo_countdown" && (
            <button
              onClick={handleStartSoloCountdown}
              disabled={countdownNumber !== null}
              className="w-full py-7 sm:py-10 rounded-3xl font-black text-base sm:text-xl tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-black hover:opacity-95 shadow-xl flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
            >
              <Clock className="h-6 w-6 sm:h-8 sm:w-8" />
              <span>{countdownNumber !== null ? `STARTING IN ${countdownNumber}...` : "START 3-SECOND COUNTDOWN"}</span>
              <span className="text-[11px] font-mono opacity-80 font-normal">
                Audio beeps 3-2-1-GO • Athlete starts unassisted
              </span>
            </button>
          )}

          {startMode === "instant" && (
            <button
              onClick={handleInstantStart}
              className="w-full py-6 sm:py-9 rounded-3xl font-black text-base sm:text-xl tracking-wider bg-[#ccff00] text-black hover:opacity-95 shadow-xl flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <Play className="h-6 w-6" />
              <span>START TIMER NOW</span>
              <span className="text-[11px] font-mono opacity-80 font-normal">
                Instant stopwatch trigger
              </span>
            </button>
          )}
        </div>
      )}

      {/* Manual Stop / Abort Button (when running) */}
      {status === "running" && (
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => {
              timingEngine.manualOverride("FINISH", getPreciseTime());
              onManualTrigger("STOP");
            }}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-red-600 hover:bg-red-500 py-5 px-4 font-black text-base text-white tracking-wide shadow-2xl active:scale-95 transition-all"
          >
            <Square className="h-5 w-5" />
            <span>MANUAL STOP (COACH BACKUP)</span>
          </button>

          <button
            onClick={handleResetForNextSprint}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/20 bg-zinc-900 hover:bg-zinc-800 py-5 px-5 text-sm font-bold text-zinc-300 active:scale-95 transition-all"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Abort</span>
          </button>
        </div>
      )}
    </div>
  );
};
