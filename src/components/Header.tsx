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
  Scan,
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
  onOpenScanner: () => void;
  onOpenGateQR: () => void;
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
  onOpenScanner,
  onOpenGateQR,
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
        return "Start Gate";
      case "finish_camera":
        return "Finish Gate";
      case "split_camera":
        return "Split Gate";
      case "lap_camera":
        return "Lap Gate";
      case "secondary_camera":
        return "Gate Sensor";
      default:
        return role;
    }
  };

  return (
    <>
      {/* Top Minimal Header Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#090a0d]/95 backdrop-blur-md safe-top">
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-3 sm:px-6">
          {/* Logo */}
          <button
            onClick={() => onSelectView("live_console")}
            className="flex items-center gap-2 text-left focus:outline-none"
          >
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 border border-[#ccff00]/40 shadow-[0_0_12px_rgba(204,255,0,0.15)] flex-shrink-0">
              <div className="absolute inset-1 border border-dashed border-[#ccff00]/40 rounded-sm" />
              <div className="h-1.5 w-1.5 rounded-full bg-[#ccff00]" />
            </div>
            <div>
              <div className="flex items-center gap-0.5">
                <span className="text-base font-black tracking-wider text-white">PACE</span>
                <span className="text-base font-black tracking-wider text-[#ccff00]">FRAME</span>
              </div>
            </div>
          </button>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-1 rounded-full bg-zinc-900/90 border border-white/10 p-1 text-xs">
            <button
              onClick={() => onSelectView("live_console")}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-bold transition-all ${
                currentView === "live_console"
                  ? "bg-[#ccff00] text-black shadow-sm"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              <Timer className="h-3.5 w-3.5" />
              Console
            </button>
            <button
              onClick={() => onSelectView("gate_camera")}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-bold transition-all ${
                currentView === "gate_camera"
                  ? "bg-[#ccff00] text-black shadow-sm"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              Gate Camera
            </button>
            <button
              onClick={() => onSelectView("results")}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-bold transition-all ${
                currentView === "results"
                  ? "bg-[#ccff00] text-black shadow-sm"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              <Award className="h-3.5 w-3.5" />
              Results
            </button>
            <button
              onClick={() => onSelectView("history")}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-bold transition-all ${
                currentView === "history"
                  ? "bg-[#ccff00] text-black shadow-sm"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              History
            </button>
          </nav>

          {/* Right Action Tools */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Direct In-App Scanner Button */}
            <button
              onClick={onOpenScanner}
              title="Scan QR Code to Pair this device"
              className="flex items-center gap-1 rounded-xl border border-white/20 bg-zinc-900/90 hover:bg-zinc-800 px-2.5 py-1.5 text-[11px] font-mono font-bold text-white active:scale-95 transition-all shadow"
            >
              <Scan className="h-3.5 w-3.5 text-[#ccff00]" />
              <span className="hidden xs:inline">Scan QR</span>
            </button>

            {/* Session ID Pill */}
            <button
              onClick={copySessionId}
              title="Click to copy Session ID"
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-mono text-zinc-300 active:scale-95 transition-all"
            >
              <Radio className="h-3 w-3 text-[#ccff00]" />
              <span className="font-bold text-white text-[11px]">{sessionId}</span>
            </button>

            {/* Role Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                className="flex items-center gap-1 rounded-xl border border-white/15 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 active:scale-95 transition-all"
              >
                <span className="text-[#ccff00]">{getRoleLabel(deviceRole)}</span>
                <ChevronDown className="h-3 w-3 text-zinc-400" />
              </button>

              {showRoleDropdown && (
                <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-white/15 bg-zinc-950 p-1.5 shadow-2xl z-50">
                  <div className="px-2 py-1 text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                    Switch Device Role
                  </div>
                  {(
                    [
                      "master_console",
                      "finish_camera",
                      "start_camera",
                      "split_camera",
                    ] as DeviceRole[]
                  ).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        onRoleChange(r);
                        setShowRoleDropdown(false);
                        if (r === "master_console") {
                          onSelectView("live_console");
                        } else {
                          onSelectView("gate_camera");
                        }
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

            {/* WakeLock */}
            <button
              onClick={toggleWakeLock}
              title={wakeLockActive ? "Screen Awake ON" : "Screen Awake OFF"}
              className={`rounded-xl border p-1.5 transition-all active:scale-95 ${
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
              className="rounded-xl border border-white/10 bg-zinc-900 p-1.5 text-zinc-300 active:scale-95 transition-all"
            >
              {isMuted ? <VolumeX className="h-3.5 w-3.5 text-zinc-500" /> : <Volume2 className="h-3.5 w-3.5 text-[#ccff00]" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#090a0d]/95 backdrop-blur-lg safe-bottom">
        <div className="grid grid-cols-5 h-14 items-center">
          <button
            onClick={() => onSelectView("live_console")}
            className={`flex flex-col items-center justify-center h-full transition-colors ${
              currentView === "live_console" ? "text-[#ccff00]" : "text-zinc-400"
            }`}
          >
            <Timer className="h-4 w-4" />
            <span className="text-[10px] font-semibold mt-0.5">Console</span>
          </button>

          <button
            onClick={() => onSelectView("gate_camera")}
            className={`flex flex-col items-center justify-center h-full transition-colors ${
              currentView === "gate_camera" ? "text-[#ccff00]" : "text-zinc-400"
            }`}
          >
            <Camera className="h-4 w-4" />
            <span className="text-[10px] font-semibold mt-0.5">Gate Cam</span>
          </button>

          {/* Central QR Scan Action */}
          <button
            onClick={onOpenScanner}
            className="flex flex-col items-center justify-center h-full -mt-2 group"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full border shadow-lg bg-[#ccff00] text-black border-[#ccff00] shadow-[0_0_15px_rgba(204,255,0,0.4)] active:scale-90 transition-transform">
              <Scan className="h-5 w-5" />
            </div>
            <span className="text-[9px] font-bold mt-0.5 text-[#ccff00]">
              Scan QR
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
