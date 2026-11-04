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
  ChevronDown,
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
        return "Console";
      case "start_camera":
        return "Start Cam";
      case "finish_camera":
        return "Finish Cam";
      case "split_camera":
        return "Split Cam";
      case "lap_camera":
        return "Lap Cam";
      case "secondary_camera":
        return "Aux Cam";
      default:
        return role;
    }
  };

  const getSyncBadge = () => {
    if (syncQuality.quality === "excellent") {
      return {
        bg: "bg-emerald-950/70 border-emerald-500/40 text-emerald-400",
        label: `±${syncQuality.jitterMs || 0.8}ms`,
        dot: "bg-emerald-400",
      };
    }
    if (syncQuality.quality === "good") {
      return {
        bg: "bg-lime-950/70 border-lime-500/40 text-lime-400",
        label: `±${syncQuality.jitterMs}ms`,
        dot: "bg-lime-400",
      };
    }
    return {
      bg: "bg-zinc-900 border-zinc-700 text-zinc-400",
      label: "Syncing",
      dot: "bg-zinc-500 animate-pulse",
    };
  };

  const syncBadge = getSyncBadge();

  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#0a0c0f]/95 backdrop-blur-md safe-top">
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-2.5 sm:px-6">
          {/* Logo & Emblem */}
          <button
            onClick={() => onSelectView("dashboard")}
            className="flex items-center gap-2 text-left focus:outline-none"
          >
            <div className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-zinc-900 border border-[#ccff00]/40 shadow-[0_0_12px_rgba(204,255,0,0.15)] flex-shrink-0">
              <div className="absolute inset-1 border border-dashed border-[#ccff00]/40 rounded-sm" />
              <div className="h-1.5 w-1.5 rounded-full bg-[#ccff00]" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-base sm:text-lg font-black tracking-wider text-white">PACE</span>
                <span className="text-base sm:text-lg font-black tracking-wider text-[#ccff00]">FRAME</span>
              </div>
            </div>
          </button>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-1 rounded-full bg-zinc-900/90 border border-white/10 p-1">
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

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Session Code Pill */}
            <button
              onClick={copySessionId}
              title="Click to copy Session ID"
              className="flex items-center gap-1 sm:gap-1.5 rounded-lg border border-white/10 bg-zinc-900/90 px-2 sm:px-2.5 py-1 text-[11px] font-mono text-zinc-300 active:scale-95 transition-all"
            >
              <Radio className="h-3 w-3 text-[#ccff00]" />
              <span className="font-bold text-white text-[10px] sm:text-xs">{sessionId}</span>
            </button>

            {/* Sync Badge (Hidden on very small screens, visible on sm+) */}
            <div
              className={`hidden xs:flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-mono ${syncBadge.bg}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${syncBadge.dot}`} />
              <span className="font-semibold">{syncBadge.label}</span>
            </div>

            {/* Role Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                className="flex items-center gap-1 rounded-lg border border-white/15 bg-zinc-900 px-2 sm:px-2.5 py-1 text-[11px] font-semibold text-zinc-200 active:scale-95 transition-all"
              >
                <span className="text-[#ccff00]">{getRoleLabel(deviceRole)}</span>
                <ChevronDown className="h-3 w-3 text-zinc-400" />
              </button>

              {showRoleDropdown && (
                <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-white/15 bg-zinc-950 p-1.5 shadow-2xl z-50">
                  <div className="px-2 py-1 text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                    Device Role
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

            {/* Pair Button */}
            <button
              onClick={onOpenPairing}
              className="flex items-center justify-center rounded-lg border border-[#ccff00]/30 bg-[#ccff00]/10 p-1.5 sm:px-2.5 sm:py-1 text-xs font-semibold text-[#ccff00] active:scale-95 transition-all"
              title="Pair Devices"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span className="hidden sm:inline sm:ml-1">Pair</span>
            </button>

            {/* WakeLock */}
            <button
              onClick={toggleWakeLock}
              title={wakeLockActive ? "Screen Awake ON" : "Screen Awake OFF"}
              className={`rounded-lg border p-1.5 transition-all active:scale-95 ${
                wakeLockActive
                  ? "border-amber-500/40 bg-amber-950/40 text-amber-400"
                  : "border-white/10 bg-zinc-900 text-zinc-400"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
            </button>

            {/* Sound Mute */}
            <button
              onClick={toggleMute}
              title={isMuted ? "Sound Muted" : "Sound Enabled"}
              className="rounded-lg border border-white/10 bg-zinc-900 p-1.5 text-zinc-300 active:scale-95 transition-all"
            >
              {isMuted ? <VolumeX className="h-3.5 w-3.5 text-zinc-500" /> : <Volume2 className="h-3.5 w-3.5 text-[#ccff00]" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb Navigation Bar (Visible on < md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0a0c0f]/95 backdrop-blur-lg safe-bottom">
        <div className="grid grid-cols-5 h-14 items-center">
          <button
            onClick={() => onSelectView("dashboard")}
            className={`flex flex-col items-center justify-center h-full transition-colors ${
              currentView === "dashboard" ? "text-[#ccff00]" : "text-zinc-400"
            }`}
          >
            <Activity className="h-4 w-4" />
            <span className="text-[10px] font-semibold mt-0.5">Dash</span>
          </button>

          <button
            onClick={() => onSelectView("camera_studio")}
            className={`flex flex-col items-center justify-center h-full transition-colors ${
              currentView === "camera_studio" ? "text-[#ccff00]" : "text-zinc-400"
            }`}
          >
            <Camera className="h-4 w-4" />
            <span className="text-[10px] font-semibold mt-0.5">Studio</span>
          </button>

          {/* Central Prominent Live Console Button */}
          <button
            onClick={() => onSelectView("live_console")}
            className="flex flex-col items-center justify-center h-full -mt-2 group"
          >
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-transform active:scale-90 ${
                currentView === "live_console"
                  ? "bg-[#ccff00] text-black border-[#ccff00] shadow-[0_0_15px_rgba(204,255,0,0.4)]"
                  : "bg-zinc-900 text-[#ccff00] border-white/20"
              }`}
            >
              <Timer className="h-5 w-5" />
            </div>
            <span
              className={`text-[9px] font-bold mt-0.5 ${
                currentView === "live_console" ? "text-[#ccff00]" : "text-zinc-400"
              }`}
            >
              Console
            </span>
          </button>

          <button
            onClick={() => onSelectView("results")}
            className={`flex flex-col items-center justify-center h-full transition-colors ${
              currentView === "results" ? "text-[#ccff00]" : "text-zinc-400"
            }`}
          >
            <Award className="h-4 w-4" />
            <span className="text-[10px] font-semibold mt-0.5">Results</span>
          </button>

          <button
            onClick={() => onSelectView("history")}
            className={`flex flex-col items-center justify-center h-full transition-colors ${
              currentView === "history" ? "text-[#ccff00]" : "text-zinc-400"
            }`}
          >
            <History className="h-4 w-4" />
            <span className="text-[10px] font-semibold mt-0.5">History</span>
          </button>
        </div>
      </nav>
    </>
  );
};
