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
  Radio,
  Camera,
  Activity,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import {
  Session,
  SessionStatus,
  TimingResult,
  SplitRecord,
  LapRecord,
  ConnectedDevice,
} from "@/types";
import { TimingEngine } from "@/lib/timing/timingEngine";

interface LiveConsoleViewProps {
  session: Session;
  timingEngine: TimingEngine;
  connectedDevices: ConnectedDevice[];
  onOpenResults: (result: TimingResult) => void;
  onOpenStudio: () => void;
  onManualTrigger: (type: "ARM" | "START" | "STOP") => void;
}

export const LiveConsoleView: React.FC<LiveConsoleViewProps> = ({
  session,
  timingEngine,
  connectedDevices,
  onOpenResults,
  onOpenStudio,
  onManualTrigger,
}) => {
  const [status, setStatus] = useState<SessionStatus>(timingEngine.getStatus());
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [splits, setSplits] = useState<SplitRecord[]>(timingEngine.getSplits());
  const [laps, setLaps] = useState<LapRecord[]>(timingEngine.getLaps());
  const [currentResult, setCurrentResult] = useState<TimingResult | null>(null);

  // Hold & Release button state
  const [isHoldingStart, setIsHoldingStart] = useState<boolean>(false);
  const holdStartTimeRef = useRef<number>(0);

  // Haptic feedback trigger
  const triggerHaptic = (pattern: number | number[]) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  };

  // High-frequency animation frame loop for running timer
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
      onStatusChange: (s) => setStatus(s),
      onResultGenerated: (res) => {
        setCurrentResult(res);
        triggerHaptic([100, 50, 150]);
      },
    });

    return () => {
      cancelAnimationFrame(animId);
      unsubscribe();
    };
  }, [timingEngine]);

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
    if (holdDuration < 200) {
      timingEngine.disarm();
      return;
    }

    if (status === "armed" || status === "idle") {
      const releaseTime = performance.now();
      timingEngine.manualOverride("START", releaseTime);
      onManualTrigger("START");
      triggerHaptic([60, 40, 100]);
    }
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
    setCurrentResult(null);
    setElapsedMs(0);
    setSplits([]);
    setLaps([]);
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
          label: "TIMING RUNNING",
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
          label: "ATTEMPT RECORDED",
          pulse: false,
        };
      default:
        return {
          bg: "bg-zinc-900 border-white/10 text-zinc-400",
          label:
            session.startMethod === "hold_and_release"
              ? "PRESS & HOLD START"
              : "WAITING FOR START GATE",
          pulse: false,
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0c0f] p-2.5 sm:p-5 max-w-7xl mx-auto w-full overflow-y-auto no-overscroll pb-20 md:pb-6">
      {/* Top Athlete Bar */}
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

      {/* Main Digital Chronograph Display (Mobile Scaled) */}
      <div className="my-3 sm:my-5 rounded-3xl border border-white/15 bg-gradient-to-b from-[#13171e] to-[#0c0e12] p-4 sm:p-8 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
        {/* Digital Numbers */}
        <div className="relative z-10 flex items-baseline justify-center font-mono font-black tracking-tighter select-none py-2 sm:py-6">
          {mm && (
            <span className="text-4xl xs:text-5xl sm:text-7xl md:text-8xl text-zinc-400">
              {mm}
            </span>
          )}
          <span className="text-5xl xs:text-6xl sm:text-8xl md:text-9xl text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.15)] font-mono-numbers">
            {ss}
          </span>
          <span className="text-3xl xs:text-4xl sm:text-6xl md:text-7xl text-[#ccff00] ml-1 drop-shadow-[0_0_20px_rgba(204,255,0,0.3)] font-mono-numbers">
            .{mmm}
          </span>
          <span className="text-[10px] sm:text-xs font-bold text-zinc-500 ml-1.5 uppercase tracking-widest font-sans">
            S
          </span>
        </div>

        {/* Sub Telemetry Bar */}
        <div className="relative z-10 mt-1 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-[10px] sm:text-xs font-mono text-zinc-400">
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
            <span>TRIGGER: </span>
            <span className="font-bold text-zinc-300 uppercase">
              {session.startMethod === "hold_and_release" ? "Hold/Release" : "Auto Cam"}
            </span>
          </div>
        </div>

        {/* Finished Result Banner */}
        {status === "finished" && currentResult && (
          <div className="relative z-10 mt-4 w-full flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/70 p-3 sm:p-4 shadow-xl">
            <div className="flex items-center gap-3">
              <Award className="h-7 w-7 text-emerald-400 flex-shrink-0" />
              <div>
                <div className="text-[10px] font-mono text-emerald-300 uppercase tracking-wider">
                  Attempt Recorded
                </div>
                <div className="text-xl sm:text-2xl font-black text-white">
                  {(currentResult.totalTimeMs / 1000).toFixed(3)}s
                </div>
                <div className="text-[10px] text-zinc-300 font-mono">
                  Uncertainty: ±{currentResult.uncertaintyMs}ms • {currentResult.timingQuality}
                </div>
              </div>
            </div>
            <button
              onClick={() => onOpenResults(currentResult)}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-white text-black px-4 py-2 text-xs font-bold shadow-lg hover:bg-zinc-200 active:scale-95 transition-all"
            >
              Inspect Evidence
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Start / Stop Trigger Controls (Mobile Thumb-Optimized) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 mb-4">
        {session.startMethod === "hold_and_release" ? (
          <button
            onPointerDown={handleStartPointerDown}
            onPointerUp={handleStartPointerUp}
            disabled={status === "running"}
            className={`col-span-1 sm:col-span-2 relative flex flex-col items-center justify-center rounded-2xl border p-5 sm:p-6 select-none transition-all touch-none min-h-[90px] sm:min-h-[110px] ${
              isHoldingStart
                ? "border-amber-400 bg-amber-500/25 shadow-[0_0_35px_rgba(245,158,11,0.35)] scale-[0.98]"
                : status === "running"
                ? "border-white/10 bg-zinc-950/40 opacity-40 cursor-not-allowed"
                : "border-[#ccff00]/60 bg-[#ccff00]/15 hover:bg-[#ccff00]/25 shadow-[0_0_20px_rgba(204,255,0,0.15)] active:scale-[0.98]"
            }`}
          >
            <Zap
              className={`h-7 w-7 mb-1 ${
                isHoldingStart ? "text-amber-400 animate-bounce" : "text-[#ccff00]"
              }`}
            />
            <span className="text-sm sm:text-base font-black tracking-wider text-white uppercase">
              {isHoldingStart ? "RELEASE TO START SPRINT" : "HOLD & RELEASE START"}
            </span>
            <span className="text-[10px] font-mono text-zinc-400 mt-0.5">
              {isHoldingStart ? "Hold firmly until athlete starts" : "Press & hold thumb to arm"}
            </span>
          </button>
        ) : (
          <div className="col-span-1 sm:col-span-2 rounded-2xl border border-white/10 bg-zinc-950 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-[#ccff00]/10 p-2 text-[#ccff00]">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Camera Gate Armed
                </h4>
                <p className="text-[10px] text-zinc-400">
                  Continuous optical torso monitoring active.
                </p>
              </div>
            </div>
            <button
              onClick={onOpenStudio}
              className="rounded-xl border border-white/15 bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-zinc-300"
            >
              Adjust Gate
            </button>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-row sm:flex-col gap-2">
          {status === "running" ? (
            <>
              <button
                onClick={handleStopOrOverride}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl border border-red-500/50 bg-red-950/70 p-3 sm:p-4 text-xs sm:text-sm font-bold text-red-300 active:scale-95 shadow-lg transition-all"
              >
                <Square className="h-4 w-4" />
                Finish Sprint
              </button>
              <button
                onClick={handleManualSplit}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-zinc-900 p-2.5 sm:p-3 text-xs font-bold text-zinc-200 active:scale-95 transition-all"
              >
                <Flag className="h-3.5 w-3.5 text-[#ccff00]" />
                Split
              </button>
            </>
          ) : (
            <button
              onClick={handleReset}
              className="w-full flex sm:flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-zinc-950 p-3 sm:p-5 text-zinc-400 active:scale-95 transition-all"
            >
              <RotateCcw className="h-5 w-5 text-zinc-400" />
              <span className="text-xs font-bold uppercase tracking-wider">New Attempt</span>
            </button>
          )}
        </div>
      </div>

      {/* Splits Table (Scrollable on small mobile) */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-3 sm:p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5 text-[#ccff00]" />
            Split Gates ({splits.length})
          </h3>
          <span className="text-[10px] font-mono text-zinc-500">
            Auto Photo-Finish
          </span>
        </div>

        {splits.length === 0 ? (
          <div className="py-6 text-center text-xs font-mono text-zinc-500">
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
                  <th className="pb-1.5">Photo</th>
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
                          className="h-7 w-12 object-cover rounded border border-white/10"
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
