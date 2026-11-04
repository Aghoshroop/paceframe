"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Camera,
  Timer,
  Award,
  History,
  QrCode,
  Volume2,
  VolumeX,
  Sun,
  Radio,
  Wifi,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { DeviceRole, SyncQuality, ConnectionStatus } from "@/types";
import { soundEngine } from "@/lib/audio/soundEngine";
import { wakeLockManager } from "@/lib/device/wakeLock";

interface HeaderProps {
  currentView: string;
  onSelectView: (view: any) => void;
  sessionId: string;
  deviceRole: DeviceRole;
  onRoleChange: (role: DeviceRole) => void;
  syncQuality: SyncQuality;
  connectionStatus: ConnectionStatus;
  connectedDevicesCount: number;
  onOpenPairing: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSelectView,
  sessionId,
  deviceRole,
  onRoleChange,
  syncQuality,
  connectionStatus,
  connectedDevicesCount,
  onOpenPairing,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    // Request WakeLock on load
    wakeLockManager.requestLock().then((active) => setWakeLockActive(active));
  }, []);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundEngine.setMuted(next);
  };

  const toggleWakeLock = async () => {
    if (wakeLockActive) {
      await wakeLockManager.releaseLock();
      setWakeLockActive(false);
    } else {
      const active = await wakeLockManager.requestLock();
      setWakeLockActive(active);
    }
  };

  const copySessionId = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(sessionId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    }
  };

  const getRoleLabel = (role: DeviceRole) => {
    switch (role) {
      case "master_console":
        return "Coach Console";
      case "start_camera":
        return "Start Camera";
      case "finish_camera":
        return "Finish Camera";
      case "split_camera":
        return "Split Camera";
      case "lap_camera":
        return "Lap Camera";
      case "secondary_camera":
        return "Aux Camera";
      default:
        return role;
    }
  };

  const getSyncBadge = () => {
    if (syncQuality.quality === "excellent") {
      return {
        bg: "bg-emerald-950/70 border-emerald-500/40 text-emerald-400",
        label: `±${syncQuality.jitterMs || 0.8}ms Sync`,
        dot: "bg-emerald-400",
      };
    }
    if (syncQuality.quality === "good") {
      return {
        bg: "bg-lime-950/70 border-lime-500/40 text-lime-400",
        label: `±${syncQuality.jitterMs}ms Sync`,
        dot: "bg-lime-400",
      };
    }
    if (syncQuality.quality === "fair") {
      return {
        bg: "bg-amber-950/70 border-amber-500/40 text-amber-400",
        label: `±${syncQuality.jitterMs}ms Fair`,
        dot: "bg-amber-400",
      };
    }
    return {
      bg: "bg-zinc-900 border-zinc-700 text-zinc-400",
      label: "Syncing...",
      dot: "bg-zinc-500 animate-pulse",
    };
  };

  const syncBadge = getSyncBadge();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#0a0c0f]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:px-6">
        {/* Brand & Tagline */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSelectView("dashboard")}
            className="flex items-center gap-2.5 text-left focus:outline-none group"
          >
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 border border-white/15 group-hover:border-[#ccff00]/60 transition-colors shadow-[0_0_15px_rgba(204,255,0,0.12)]">
              {/* Camera reticle emblem */}
              <div className="absolute inset-1.5 border border-dashed border-[#ccff00]/40 rounded-sm" />
              <div className="h-2 w-2 rounded-full bg-[#ccff00] shadow-[0_0_8px_#ccff00]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-black tracking-wider text-white">PACE</span>
                <span className="text-lg font-black tracking-wider text-[#ccff00]">FRAME</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-mono tracking-widest text-zinc-300">
                  CV.FAT
                </span>
              </div>
              <p className="hidden text-[10px] tracking-tight text-zinc-400 md:block font-medium">
                Every Split. Every Sprint. Precisely Captured.
              </p>
            </div>
          </button>
        </div>

        {/* Center Nav Items */}
        <nav className="hidden lg:flex items-center gap-1 rounded-full bg-zinc-900/90 border border-white/10 p-1">
          <button
            onClick={() => onSelectView("dashboard")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              currentView === "dashboard"
                ? "bg-[#ccff00] text-black shadow-sm"
                : "text-zinc-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Dashboard
          </button>
          <button
            onClick={() => onSelectView("camera_studio")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              currentView === "camera_studio"
                ? "bg-[#ccff00] text-black shadow-sm"
                : "text-zinc-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            Camera Studio
          </button>
          <button
            onClick={() => onSelectView("live_console")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              currentView === "live_console"
                ? "bg-[#ccff00] text-black shadow-sm"
                : "text-zinc-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Timer className="h-3.5 w-3.5" />
            Live Console
          </button>
          <button
            onClick={() => onSelectView("results")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              currentView === "results"
                ? "bg-[#ccff00] text-black shadow-sm"
                : "text-zinc-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Award className="h-3.5 w-3.5" />
            Results
          </button>
          <button
            onClick={() => onSelectView("history")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              currentView === "history"
                ? "bg-[#ccff00] text-black shadow-sm"
                : "text-zinc-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            History
          </button>
        </nav>

        {/* Right Controls & Telemetry */}
        <div className="flex items-center gap-2">
          {/* Active Session Code Pill */}
          <button
            onClick={copySessionId}
            title="Click to copy Session ID"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-xs font-mono text-zinc-300 hover:border-white/20 transition-all"
          >
            <Radio className="h-3.5 w-3.5 text-[#ccff00]" />
            <span className="font-semibold text-white">{sessionId}</span>
            <span className="text-[10px] text-zinc-500">
              {copiedCode ? "COPIED!" : `${connectedDevicesCount} DEV`}
            </span>
          </button>

          {/* Sync Quality Pill */}
          <div
            className={`hidden sm:flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-mono ${syncBadge.bg}`}
            title={`Clock RTT: ${syncQuality.rttMs}ms | Offset: ${syncQuality.clockOffsetMs}ms | Jitter: ${syncQuality.jitterMs}ms`}
          >
            <span className={`h-2 w-2 rounded-full ${syncBadge.dot}`} />
            <span className="font-semibold">{syncBadge.label}</span>
          </div>

          {/* Device Role Selector */}
          <div className="relative">
            <button
              onClick={() => setShowRoleDropdown(!showRoleDropdown)}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:border-[#ccff00]/50 transition-all"
            >
              <span className="text-zinc-400 text-[10px] uppercase tracking-wider">Role:</span>
              <span className="font-semibold text-white">{getRoleLabel(deviceRole)}</span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            </button>

            {showRoleDropdown && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-white/15 bg-zinc-950 p-1.5 shadow-2xl z-50">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Assign This Device
                </div>
                {(
                  [
                    "master_console",
                    "start_camera",
                    "finish_camera",
                    "split_camera",
                    "lap_camera",
                    "secondary_camera",
                  ] as DeviceRole[]
                ).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      onRoleChange(r);
                      setShowRoleDropdown(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                      deviceRole === r
                        ? "bg-[#ccff00]/15 text-[#ccff00] font-semibold"
                        : "text-zinc-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>{getRoleLabel(r)}</span>
                    {deviceRole === r && <div className="h-1.5 w-1.5 rounded-full bg-[#ccff00]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pair Devices QR Button */}
          <button
            onClick={onOpenPairing}
            className="flex items-center gap-1.5 rounded-lg border border-[#ccff00]/30 bg-[#ccff00]/10 px-2.5 py-1.5 text-xs font-semibold text-[#ccff00] hover:bg-[#ccff00]/20 transition-all"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pair</span>
          </button>

          {/* WakeLock Toggle */}
          <button
            onClick={toggleWakeLock}
            title={wakeLockActive ? "Screen Awake Active" : "Enable Screen Awake"}
            className={`rounded-lg border p-1.5 transition-all ${
              wakeLockActive
                ? "border-amber-500/40 bg-amber-950/40 text-amber-400"
                : "border-white/10 bg-zinc-900 text-zinc-400 hover:text-white"
            }`}
          >
            <Sun className="h-4 w-4" />
          </button>

          {/* Sound Mute Toggle */}
          <button
            onClick={toggleMute}
            title={isMuted ? "Sound Muted" : "Sound Enabled"}
            className="rounded-lg border border-white/10 bg-zinc-900 p-1.5 text-zinc-300 hover:text-white transition-all"
          >
            {isMuted ? <VolumeX className="h-4 w-4 text-zinc-500" /> : <Volume2 className="h-4 w-4 text-[#ccff00]" />}
          </button>
        </div>
      </div>
    </header>
  );
};

