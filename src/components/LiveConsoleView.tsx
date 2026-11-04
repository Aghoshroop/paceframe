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
  AlertTriangle,
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
  StartMethod,
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
  const holdTimerRef = useRef<any>(null);

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
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    setIsHoldingStart(true);
    holdStartTimeRef.current = performance.now();
    timingEngine.arm();
    onManualTrigger("ARM");
  };

  const handleStartPointerUp = (e: React.PointerEvent) => {
    if (!isHoldingStart) return;
    setIsHoldingStart(false);

    const holdDuration = performance.now() - holdStartTimeRef.current;
    // Require at least 250ms hold to prevent accidental quick tap
    if (holdDuration < 250) {
      timingEngine.disarm();
      return;
    }

    if (status === "armed" || status === "idle") {
      const releaseTime = performance.now();
      timingEngine.manualOverride("START", releaseTime);
      onManualTrigger("START");
    }
  };

  const handleStopOrOverride = () => {
    if (status === "running") {
      timingEngine.manualOverride("FINISH");
      onManualTrigger("STOP");
    }
  };

  const handleManualSplit = () => {
    if (status === "running") {
      timingEngine.manualOverride("SPLIT");
    }
  };

  const handleReset = () => {
    timingEngine.reset();
    setCurrentResult(null);
    setElapsedMs(0);
    setSplits([]);
    setLaps([]);
  };

  // Format Elapsed Milliseconds to SS.mmm or MM:SS.mmm
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
          label: "ARMED // READY FOR RELEASE",
          pulse: true,
        };
      case "running":
        return {
          bg: "bg-[#ccff00]/15 border-[#ccff00]/50 text-[#ccff00]",
          label: "TRACK TIMING RUNNING",
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
          label: "ATTEMPT COMPLETED",
          pulse: false,
        };
      default:
        return {
          bg: "bg-zinc-900 border-white/10 text-zinc-400",
          label:
            session.startMethod === "hold_and_release"
              ? "PRESS & HOLD START TO ARM"
              : "WAITING FOR START GATE CROSSING",
          pulse: false,
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0c0f] p-3 sm:p-6 max-w-7xl mx-auto w-full overflow-y-auto">
      {/* Top Athlete & Session Card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-950/80 p-4 sm:p-5 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 border border-white/15 text-[#ccff00]">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-wide text-white">
                {session.athleteName}
              </h2>
              {session.distanceMeters && (
                <span className="rounded bg-[#ccff00]/15 border border-[#ccff00]/30 px-2 py-0.5 text-[10px] font-mono font-bold text-[#ccff00]">
                  {session.isFlyingStart ? `FLYING ${session.distanceMeters}M` : `${session.distanceMeters}M`}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 font-medium">
              {session.eventName} • {session.sessionName}
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-2 font-mono text-xs font-bold tracking-wider ${
            statusBadge.bg
          } ${statusBadge.pulse ? "animate-pulse" : ""}`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          <span>{statusBadge.label}</span>
        </div>
      </div>

      {/* Main Digital Instrument Display */}
      <div className="my-6 rounded-3xl border border-white/15 bg-gradient-to-b from-[#12151b] to-[#0d0f14] p-6 sm:p-10 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        {/* Digital Running Chronograph */}
        <div className="relative z-10 flex items-baseline justify-center font-mono font-black tracking-tighter select-none py-4">
          {mm && <span className="text-5xl sm:text-7xl md:text-8xl text-zinc-400">{mm}</span>}
          <span className="text-6xl sm:text-8xl md:text-9xl text-white drop-shadow-[0_0_35px_rgba(255,255,255,0.15)]">
            {ss}
          </span>
          <span className="text-4xl sm:text-6xl md:text-7xl text-[#ccff00] ml-1 drop-shadow-[0_0_25px_rgba(204,255,0,0.3)]">
            .{mmm}
          </span>
          <span className="text-sm sm:text-base font-bold text-zinc-500 ml-2 uppercase tracking-widest font-sans">
            SEC
          </span>
        </div>

        {/* Bottom Lap & Interval Sub-Tracker */}
        <div className="relative z-10 mt-2 flex items-center gap-6 text-xs font-mono text-zinc-400">
          <div>
            <span>CURRENT SPLITS: </span>
            <span className="font-bold text-white">{splits.length}</span>
          </div>
          {session.targetLaps && session.targetLaps > 0 ? (
            <div>
              <span>LAP: </span>
              <span className="font-bold text-[#ccff00]">
                {timingEngine.getCurrentLap()} / {session.targetLaps}
              </span>
            </div>
          ) : null}
          <div>
            <span>METHOD: </span>
            <span className="font-bold text-zinc-300 uppercase">
              {session.startMethod === "hold_and_release" ? "Hold & Release" : "Camera Auto"}
            </span>
          </div>
        </div>

        {/* Finished Result Banner */}
        {status === "finished" && currentResult && (
          <div className="relative z-10 mt-6 flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/60 p-4 sm:p-5 shadow-2xl">
            <Award className="h-8 w-8 text-emerald-400 flex-shrink-0" />
            <div>
              <div className="text-xs font-mono text-emerald-300 uppercase tracking-wider">
                Official Attempt Recorded
              </div>
              <div className="text-2xl font-black text-white">
                {(currentResult.totalTimeMs / 1000).toFixed(3)}s
              </div>
              <div className="text-xs text-zinc-300 font-mono">
                Uncertainty: ±{currentResult.uncertaintyMs}ms • {currentResult.timingQuality}
              </div>
            </div>
            <button
              onClick={() => onOpenResults(currentResult)}
              className="sm:ml-auto flex items-center gap-2 rounded-xl bg-white text-black px-4 py-2.5 text-xs font-bold shadow-lg hover:bg-zinc-200 transition-colors"
            >
              Inspect Evidence
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Start / Stop Interaction Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Hold & Release Trigger Button (Method A) */}
        {session.startMethod === "hold_and_release" ? (
          <button
            onPointerDown={handleStartPointerDown}
            onPointerUp={handleStartPointerUp}
            disabled={status === "running"}
            className={`col-span-1 sm:col-span-2 relative flex flex-col items-center justify-center rounded-2xl border p-6 select-none transition-all touch-none ${
              isHoldingStart
                ? "border-amber-400 bg-amber-500/20 shadow-[0_0_35px_rgba(245,158,11,0.3)] scale-[0.98]"
                : status === "running"
                ? "border-white/10 bg-zinc-950/50 opacity-40 cursor-not-allowed"
                : "border-[#ccff00]/60 bg-[#ccff00]/15 hover:bg-[#ccff00]/25 shadow-[0_0_25px_rgba(204,255,0,0.15)]"
            }`}
          >
            <Zap
              className={`h-8 w-8 mb-2 ${
                isHoldingStart ? "text-amber-400 animate-bounce" : "text-[#ccff00]"
              }`}
            />
            <span className="text-base font-black tracking-wider text-white uppercase">
              {isHoldingStart ? "RELEASE TO FIRE START" : "HOLD & RELEASE START"}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1">
              {isHoldingStart
                ? "Clock starts precisely on button release"
                : "Press & hold firmly before runner starts"}
            </span>
          </button>
        ) : (
          /* Automatic Camera Start Status */
          <div className="col-span-1 sm:col-span-2 rounded-2xl border border-white/10 bg-zinc-950 p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[#ccff00]/10 p-3 text-[#ccff00]">
                <Camera className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Camera Gate Armed
                </h4>
                <p className="text-xs text-zinc-400">
                  Continuous optical monitoring. Timer triggers when torso crosses start gate.
                </p>
              </div>
            </div>
            <button
              onClick={onOpenStudio}
              className="rounded-xl border border-white/15 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
            >
              Adjust Gate
            </button>
          </div>
        )}

        {/* Right Action Stack */}
        <div className="flex flex-col gap-2.5">
          {status === "running" ? (
            <>
              <button
                onClick={handleStopOrOverride}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-red-500/50 bg-red-950/60 p-4 text-sm font-bold text-red-300 hover:bg-red-950/80 shadow-lg transition-colors"
              >
                <Square className="h-4 w-4" />
                Finish / Stop Attempt
              </button>
              <button
                onClick={handleManualSplit}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-zinc-900 p-3 text-xs font-bold text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <Flag className="h-4 w-4 text-[#ccff00]" />
                Manual Split Trigger
              </button>
            </>
          ) : (
            <button
              onClick={handleReset}
              className="h-full flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-zinc-950 p-5 text-zinc-400 hover:text-white hover:border-white/25 transition-all"
            >
              <RotateCcw className="h-6 w-6 mb-1 text-zinc-400" />
              <span className="text-xs font-bold uppercase tracking-wider">New Attempt (Reset)</span>
            </button>
          )}
        </div>
      </div>

      {/* Intermediate Splits Table */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Flag className="h-4 w-4 text-[#ccff00]" />
            Split Gates & Interval Telemetry ({splits.length})
          </h3>
          <span className="text-[11px] font-mono text-zinc-500">
            Automated Camera Timestamps
          </span>
        </div>

        {splits.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-zinc-500">
            No split gates crossed yet. Crossings will appear here with sub-frame photo-finish frames.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] text-zinc-400 uppercase">
                  <th className="pb-2">Split #</th>
                  <th className="pb-2">Gate</th>
                  <th className="pb-2">Interval</th>
                  <th className="pb-2">Cumulative</th>
                  <th className="pb-2">Speed</th>
                  <th className="pb-2">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {splits.map((s) => (
                  <tr key={s.index} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 font-bold text-[#ccff00]">#{s.index}</td>
                    <td className="py-2.5 text-white font-sans font-medium">{s.name}</td>
                    <td className="py-2.5 text-zinc-300 font-bold">
                      {(s.splitTimeMs / 1000).toFixed(3)}s
                    </td>
                    <td className="py-2.5 text-white font-bold">
                      {(s.elapsedMs / 1000).toFixed(3)}s
                    </td>
                    <td className="py-2.5 text-zinc-400">
                      {s.speedKmh ? `${s.speedKmh} km/h` : "—"}
                    </td>
                    <td className="py-2.5">
                      {s.frameReference ? (
                        <img
                          src={s.frameReference}
                          alt="Photo Finish"
                          className="h-9 w-16 object-cover rounded border border-white/10"
                        />
                      ) : (
                        <span className="text-zinc-600 text-[10px]">No Frame</span>
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

