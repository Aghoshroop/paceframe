"use client";

import React from "react";
import {
  Play,
  QrCode,
  Camera,
  Settings,
  History,
  Activity,
  Zap,
  Radio,
  Award,
  ShieldCheck,
  ChevronRight,
  Cpu,
} from "lucide-react";
import { Session, TimingResult, Athlete, DeviceRole, SyncQuality } from "@/types";

interface DashboardViewProps {
  currentSession: Session;
  recentResults: TimingResult[];
  athletes: Athlete[];
  deviceRole: DeviceRole;
  syncQuality: SyncQuality;
  connectedDevicesCount: number;
  onOpenSessionConfig: () => void;
  onOpenPairing: () => void;
  onOpenStudio: () => void;
  onOpenConsole: () => void;
  onOpenHistory: () => void;
  onSelectResult: (res: TimingResult) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentSession,
  recentResults,
  athletes,
  deviceRole,
  syncQuality,
  connectedDevicesCount,
  onOpenSessionConfig,
  onOpenPairing,
  onOpenStudio,
  onOpenConsole,
  onOpenHistory,
  onSelectResult,
}) => {
  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0c0f] p-3 sm:p-6 max-w-7xl mx-auto w-full overflow-y-auto space-y-4 sm:space-y-6 pb-20 md:pb-6">
      {/* Hero Instrumentation Header */}
      <div className="rounded-3xl border border-white/15 bg-gradient-to-r from-[#12151b] via-[#101318] to-[#0d0f14] p-4 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#ccff00]/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5 sm:space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#ccff00]/30 bg-[#ccff00]/10 px-2.5 py-0.5 text-[10px] sm:text-xs font-bold text-[#ccff00]">
              <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>AUTOMATIC CAMERA SPRINT TIMING</span>
            </div>
            <h1 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight text-white leading-tight">
              Every Split. Every Sprint. <br className="hidden sm:inline" />
              <span className="text-[#ccff00]">Precisely Captured.</span>
            </h1>
            <p className="text-[11px] sm:text-xs md:text-sm text-zinc-400 leading-relaxed">
              Affordable, distance-independent timing alternative. Connect multiple phones over local mesh to track torso crossings with sub-frame computer vision.
            </p>
          </div>

          {/* Quick Launch Buttons (Touch-friendly 48px height on mobile) */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-2 w-full md:w-56">
            <button
              onClick={onOpenConsole}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#ccff00] px-4 py-3 text-xs font-black tracking-wider text-black shadow-lg hover:bg-[#b8e600] active:scale-95 transition-all min-h-[46px]"
            >
              <Play className="h-4 w-4 fill-current" />
              LIVE TIMING CONSOLE
            </button>
            <div className="grid grid-cols-2 sm:flex md:flex-col gap-2 w-full">
              <button
                onClick={onOpenStudio}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-zinc-900 px-3 py-2.5 text-xs font-bold text-white hover:border-[#ccff00]/50 active:scale-95 transition-all min-h-[44px]"
              >
                <Camera className="h-3.5 w-3.5 text-[#ccff00]" />
                CALIBRATE
              </button>
              <button
                onClick={onOpenPairing}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white active:scale-95 transition-all min-h-[44px]"
              >
                <QrCode className="h-3.5 w-3.5" />
                PAIR PHONES
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Active Session & Device Readiness Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        {/* Active Session Card */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 sm:p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                Current Session
              </span>
              <button
                onClick={onOpenSessionConfig}
                className="text-[10px] font-bold text-[#ccff00] hover:underline flex items-center gap-1"
              >
                <Settings className="h-3 w-3" />
                Edit
              </button>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white truncate">
              {currentSession.sessionName}
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Athlete: <span className="text-white font-semibold">{currentSession.athleteName}</span>
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
            <span className="text-zinc-500">
              {currentSession.distanceMeters ? `${currentSession.distanceMeters}m Sprint` : "Zone Defined"}
            </span>
            <span className="text-[#ccff00] font-bold uppercase">
              {currentSession.startMethod === "hold_and_release" ? "Hold & Release" : "Camera Auto"}
            </span>
          </div>
        </div>

        {/* Device Network & Clock Status */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 sm:p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                Grid Network & Clock
              </span>
              <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ACTIVE
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-white">{connectedDevicesCount}</span>
              <span className="text-xs font-semibold text-zinc-400">Device(s) Mesh</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Role: <span className="text-[#ccff00] font-bold capitalize">{deviceRole.replace("_", " ")}</span>
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
            <span className="text-zinc-500">Jitter: ±{syncQuality.jitterMs}ms</span>
            <span className="text-zinc-300 font-bold uppercase">{syncQuality.quality}</span>
          </div>
        </div>

        {/* Measurement Integrity Card */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 sm:p-5 shadow-xl sm:col-span-2 md:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                Measurement Integrity
              </span>
              <ShieldCheck className="h-3.5 w-3.5 text-[#ccff00]" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white">Sub-Frame Photo Finish</h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Linear torso vector interpolation across successive frames with visual evidence logging.
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>Accuracy: Optical FAT</span>
            <span className="text-[#ccff00]">Zero Fabrication</span>
          </div>
        </div>
      </div>

      {/* Recent Sprint Attempts Feed */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Award className="h-4 w-4 text-[#ccff00]" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Recent Sprint Records ({recentResults.length})
            </h3>
          </div>
          <button
            onClick={onOpenHistory}
            className="text-[10px] font-bold text-[#ccff00] hover:underline flex items-center gap-0.5"
          >
            All Logs
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {recentResults.length === 0 ? (
          <div className="py-6 text-center text-xs font-mono text-zinc-500">
            No attempts completed yet. Launch the Live Console to record electronic sprint times.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {recentResults.slice(0, 3).map((r) => (
              <div
                key={r.resultId}
                onClick={() => onSelectResult(r)}
                className="group rounded-xl border border-white/10 bg-zinc-900/60 p-3 sm:p-4 hover:border-[#ccff00]/50 active:scale-98 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white group-hover:text-[#ccff00] transition-colors truncate">
                    {r.athleteName}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500">
                    {new Date(r.recordedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="font-mono text-xl sm:text-2xl font-black text-white">
                  {(r.totalTimeMs / 1000).toFixed(3)}s
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span className="truncate max-w-[120px]">{r.eventName}</span>
                  <span className="text-[#ccff00]">±{r.uncertaintyMs}ms</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System Architecture Explanation */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 text-xs text-zinc-400 leading-relaxed">
        <h4 className="text-[11px] font-bold text-white uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-[#ccff00]" />
          Single-Device & Multi-Device Operation
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-zinc-400">
          <div>
            <strong className="text-zinc-200">Single Phone:</strong> Define both Start and Finish gates inside the camera view for flying 5m/10m sprint analysis.
          </div>
          <div>
            <strong className="text-zinc-200">Multi-Device Mesh:</strong> Connect 2 to 6+ phones via QR code with continuous NTP clock offset calibration.
          </div>
        </div>
      </div>
    </div>
  );
};
