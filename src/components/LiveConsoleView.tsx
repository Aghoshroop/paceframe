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
  Camera,
  ChevronRight,
  ShieldCheck,
  Eye,
  CheckCircle2,
  AlertCircle,
  Plus,
  Smartphone,
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
  DeviceRole,
} from "@/types";
import { TimingEngine } from "@/lib/timing/timingEngine";
import { soundEngine } from "@/lib/audio/soundEngine";

interface LiveConsoleViewProps {
  session: Session;
  timingEngine: TimingEngine;
  connectedDevices: ConnectedDevice[];
  zones: DetectionZone[];
  onOpenResults: (result: TimingResult) => void;
  onOpenGateQR: (role: DeviceRole) => void;
  onManualTrigger: (type: "ARM" | "START" | "STOP") => void;
}

export const LiveConsoleView: React.FC<LiveConsoleViewProps> = ({
  session,
  timingEngine,
  connectedDevices,
  zones,
  onOpenResults,
  onOpenGateQR,
  onManualTrigger,
}) => {
  // Timing engine reactive states
  const [status, setStatus] = useState<SessionStatus>(timingEngine.getStatus());
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [splits, setSplits] = useState<SplitRecord[]>(timingEngine.getSplits());
  const [laps, setLaps] = useState<LapRecord[]>(timingEngine.getLaps());
  const [currentResult, setCurrentResult] = useState<TimingResult | null>(null);

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
    });

    return () => {
      cancelAnimationFrame(animId);
      unsubscribe();
    };
  }, [timingEngine]);

  // Connected gate devices
  const finishGateDevice = connectedDevices.find((d) => d.deviceRole === "finish_camera");
  const startGateDevice = connectedDevices.find((d) => d.deviceRole === "start_camera");
  const splitGateDevice = connectedDevices.find((d) => d.deviceRole === "split_camera");

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
    holdStartTimeRef.current = performance.now();
    timingEngine.arm();
    onManualTrigger("ARM");
    triggerHaptic(30);
  };

  const handleStartPointerUp = (e: React.PointerEvent) => {
    if (!isHoldingStart) return;
    setIsHoldingStart(false);

    const holdDuration = performance.now() - holdStartTimeRef.current;
    if (holdDuration < 160) {
      timingEngine.disarm();
      return;
    }

    if (status === "armed" || status === "idle") {
      const releaseTime = performance.now();
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
        soundEngine.playCountdownBeep(true);
        timingEngine.manualOverride("START", performance.now());
        onManualTrigger("START");
        triggerHaptic([80, 50, 120]);
      }
    }, 1000);
  };

  // 3. Instant 1-Tap Start
  const handleQuickTapStart = () => {
    if (status === "running") return;
    timingEngine.manualOverride("START", performance.now());
    onManualTrigger("START");
    triggerHaptic([70, 40, 110]);
  };

  // 4. Reset & Re-Arm for Next Sprint
  const handleNextSprintReArm = () => {
    timingEngine.reset();
    setCurrentResult(null);
    setElapsedMs(0);
    setSplits([]);
    setLaps([]);
    setCountdownNumber(null);
    triggerHaptic(30);
  };

  const handleManualStop = () => {
    if (status === "running") {
      timingEngine.manualOverride("FINISH");
      onManualTrigger("STOP");
      triggerHaptic(80);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#090a0d] p-3 sm:p-6 max-w-4xl mx-auto w-full overflow-y-auto no-overscroll select-none pb-24 md:pb-8">
      {/* Top Session Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ccff00] animate-pulse" />
          <span className="text-xs font-mono font-bold text-white tracking-wider">
            SESSION: {session.sessionId}
          </span>
          {session.distanceMeters && (
            <span className="rounded bg-[#ccff00]/15 border border-[#ccff00]/30 px-2 py-0.5 text-[10px] font-mono font-bold text-[#ccff00]">
              {session.distanceMeters}M SPRINT
            </span>
          )}
        </div>

        <div className="text-xs font-mono text-zinc-400">
          ATHLETE: <strong className="text-white">{session.athleteName}</strong>
        </div>
      </div>

      {/* Connected Gate Devices Section */}
      <div className="my-3 sm:my-4 rounded-2xl border border-white/10 bg-zinc-950 p-3 sm:p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5 text-[#ccff00]" />
            Camera Gate Network
          </span>
          <span className="text-[10px] font-mono text-zinc-500">
            {connectedDevices.length} Connected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Finish Gate Pod */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-900/80 p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ccff00]/15 text-[#ccff00] flex-shrink-0">
                <Flag className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  Finish Line Gate
                </div>
                <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                  {finishGateDevice ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-300 font-bold truncate">
                        {finishGateDevice.deviceName} (Ready)
                      </span>
                    </>
                  ) : (
                    <span className="text-amber-400">Not Connected</span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => onOpenGateQR("finish_camera")}
              className="flex items-center gap-1 rounded-lg border border-[#ccff00]/40 bg-[#ccff00]/10 px-2.5 py-1.5 text-[11px] font-bold text-[#ccff00] hover:bg-[#ccff00]/20 active:scale-95 transition-all flex-shrink-0 ml-2"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>{finishGateDevice ? "Change Device" : "Pair Device (QR)"}</span>
            </button>
          </div>

          {/* Flying Split Gate Pod */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-900/80 p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-950 text-cyan-400 flex-shrink-0">
                <Clock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  Flying Split Gate
                </div>
                <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                  {splitGateDevice ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
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
              <span>{splitGateDevice ? "Change" : "Add Gate"}</span>
            </button>
          </div>
        </div>
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
              TIMING RUNNING // GATES ACTIVE
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

        {/* Solo Countdown Full Overlay */}
        {countdownNumber !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-20 animate-in fade-in">
            <span className="text-9xl font-black font-mono text-[#ccff00] drop-shadow-[0_0_50px_rgba(204,255,0,0.9)] animate-bounce">
              {countdownNumber}
            </span>
            <span className="text-sm font-bold uppercase tracking-widest text-white mt-2">
              Ready... Set...
            </span>
          </div>
        )}

        {/* Result Breakdown Card on Finish */}
        {status === "finished" && currentResult && (
          <div className="relative z-10 mt-4 w-full flex flex-col gap-3 rounded-2xl border border-emerald-500/50 bg-emerald-950/80 p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award className="h-8 w-8 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-[10px] font-mono text-emerald-300 uppercase font-bold tracking-wider">
                    Official Time Captured
                  </div>
                  <div className="text-3xl font-black text-white">
                    {(currentResult.totalTimeMs / 1000).toFixed(3)}s
                  </div>
                </div>
              </div>

              {currentResult.speedKmh && (
                <div className="text-right">
                  <div className="text-[10px] font-mono text-zinc-400">AVERAGE SPEED</div>
                  <div className="text-lg font-black text-[#ccff00]">
                    {currentResult.speedKmh} km/h
                  </div>
                  <div className="text-[10px] font-mono text-zinc-400">
                    {currentResult.speedMs} m/s
                  </div>
                </div>
              )}
            </div>

            {/* Photo-finish thumbnail preview */}
            {currentResult.videoEvidence?.finishFrame && (
              <div className="flex items-center justify-between border-t border-emerald-500/20 pt-2.5">
                <div className="flex items-center gap-2">
                  <img
                    src={currentResult.videoEvidence.finishFrame}
                    alt="Photo Finish Proof"
                    className="h-10 w-16 object-cover rounded-lg border border-white/20 shadow cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => setShowPhotoModal(true)}
                  />
                  <div>
                    <div className="text-[10px] font-mono font-bold text-white">
                      Photo-Finish Freeze Frame
                    </div>
                    <div className="text-[9px] font-mono text-zinc-300">
                      Sub-frame verified at finish line
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowPhotoModal(true)}
                  className="rounded-lg bg-zinc-900 border border-white/20 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-zinc-800"
                >
                  View Full Photo
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={handleNextSprintReArm}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#ccff00] text-black py-3 px-4 text-xs font-black shadow-lg hover:bg-lime-400 active:scale-95 transition-all"
              >
                <RotateCcw className="h-4 w-4" />
                Next Sprint (Re-Arm)
              </button>

              <button
                onClick={() => onOpenResults(currentResult)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 border border-white/20 text-white py-3 px-4 text-xs font-bold hover:bg-zinc-800 active:scale-95 transition-all"
              >
                Full Analytics
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Start Mode Selector Tabs */}
      {status !== "running" && status !== "finished" && (
        <div className="mb-3 flex rounded-xl bg-zinc-950 p-1 border border-white/10 text-xs font-mono font-bold">
          <button
            onClick={() => setStartMode("hold_release")}
            className={`flex-1 py-2 rounded-lg transition-all ${
              startMode === "hold_release"
                ? "bg-[#ccff00] text-black shadow font-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Starter Pistol (Hold/Release)
          </button>
          <button
            onClick={() => setStartMode("solo_countdown")}
            className={`flex-1 py-2 rounded-lg transition-all ${
              startMode === "solo_countdown"
                ? "bg-[#ccff00] text-black shadow font-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Solo Countdown (3s)
          </button>
          <button
            onClick={() => setStartMode("instant")}
            className={`flex-1 py-2 rounded-lg transition-all ${
              startMode === "instant"
                ? "bg-[#ccff00] text-black shadow font-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            1-Tap Start
          </button>
        </div>
      )}

      {/* Tactical Start / Stop Triggers */}
      {status === "running" ? (
        <div className="flex gap-2.5">
          <button
            onClick={handleManualStop}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-red-500/50 bg-red-950/80 p-4 text-sm font-bold text-red-200 active:scale-95 shadow-xl transition-all"
          >
            <Square className="h-4 w-4" />
            Manual Stop (Finish)
          </button>
        </div>
      ) : status === "finished" ? (
        <button
          onClick={handleNextSprintReArm}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border border-[#ccff00]/60 bg-[#ccff00]/15 hover:bg-[#ccff00]/25 p-4 text-sm font-black text-[#ccff00] uppercase tracking-wider active:scale-95 transition-all shadow-lg"
        >
          <RotateCcw className="h-4 w-4" />
          Re-Arm Clock for Next Sprint
        </button>
      ) : (
        <div>
          {startMode === "hold_release" && (
            <button
              onPointerDown={handleStartPointerDown}
              onPointerUp={handleStartPointerUp}
              className={`w-full relative flex flex-col items-center justify-center rounded-2xl border p-5 select-none transition-all touch-none min-h-[100px] ${
                isHoldingStart
                  ? "border-amber-400 bg-amber-500/25 shadow-[0_0_40px_rgba(245,158,11,0.4)] scale-[0.98]"
                  : "border-[#ccff00]/60 bg-[#ccff00]/15 hover:bg-[#ccff00]/25 shadow-[0_0_20px_rgba(204,255,0,0.15)] active:scale-[0.98]"
              }`}
            >
              <Zap
                className={`h-7 w-7 mb-1 ${
                  isHoldingStart ? "text-amber-400 animate-bounce" : "text-[#ccff00]"
                }`}
              />
              <span className="text-sm font-black tracking-wider text-white uppercase text-center">
                {isHoldingStart ? "RELEASE THUMB TO FIRE SPRINT!" : "PRESS & HOLD TO ARM"}
              </span>
              <span className="text-[10px] font-mono text-zinc-400 mt-1">
                {isHoldingStart ? "On your marks... Set... RELEASE!" : "Hold thumb firmly, release on start gun"}
              </span>
            </button>
          )}

          {startMode === "solo_countdown" && (
            <button
              onClick={handleStartSoloCountdown}
              className="w-full flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-zinc-900/90 hover:bg-zinc-800 p-5 min-h-[100px] active:scale-95 transition-all shadow-lg"
            >
              <Clock className="h-7 w-7 mb-1 text-[#ccff00]" />
              <span className="text-sm font-black tracking-wider text-white uppercase">
                Start 3-Second Solo Countdown
              </span>
              <span className="text-[10px] font-mono text-zinc-400 mt-1">
                Gives solo runner 3 seconds to take stance before gun
              </span>
            </button>
          )}

          {startMode === "instant" && (
            <button
              onClick={handleQuickTapStart}
              className="w-full flex flex-col items-center justify-center rounded-2xl border border-[#ccff00]/50 bg-[#ccff00]/15 hover:bg-[#ccff00]/25 p-5 min-h-[100px] active:scale-95 transition-all shadow-lg"
            >
              <Play className="h-7 w-7 mb-1 text-[#ccff00]" />
              <span className="text-sm font-black tracking-wider text-white uppercase">
                1-Tap Instant Start
              </span>
              <span className="text-[10px] font-mono text-zinc-400 mt-1">
                Starts chronograph immediately
              </span>
            </button>
          )}
        </div>
      )}

      {/* Photo-Finish Full-Screen Modal Preview */}
      {showPhotoModal && currentResult?.videoEvidence?.finishFrame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-in fade-in">
          <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden border border-white/20 bg-zinc-950 p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <span className="text-xs font-mono font-bold text-white uppercase">
                Photo-Finish Evidence // {(currentResult.totalTimeMs / 1000).toFixed(3)}s
              </span>
              <button
                onClick={() => setShowPhotoModal(false)}
                className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-white"
              >
                Close
              </button>
            </div>
            <img
              src={currentResult.videoEvidence.finishFrame}
              alt="Photo Finish Evidence"
              className="w-full max-h-[70vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
