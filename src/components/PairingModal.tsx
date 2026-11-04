"use client";

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  X,
  QrCode,
  Smartphone,
  Copy,
  Check,
  Radio,
  RefreshCw,
  Camera,
} from "lucide-react";
import { ConnectedDevice, DeviceRole } from "@/types";

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  connectedDevices: ConnectedDevice[];
  onAssignRole: (deviceId: string, role: DeviceRole) => void;
  onJoinSession: (targetSessionId: string) => void;
  onTriggerClockSync: () => void;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  connectedDevices,
  onAssignRole,
  onJoinSession,
  onTriggerClockSync,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"qr" | "join">("qr");

  useEffect(() => {
    if (isOpen && sessionId) {
      const joinUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}?session=${sessionId}`
          : sessionId;

      QRCode.toDataURL(joinUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: "#0a0c0f",
          light: "#ccff00",
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch(() => {});
    }
  }, [isOpen, sessionId]);

  if (!isOpen) return null;

  const copyShareLink = () => {
    if (typeof window !== "undefined") {
      const shareUrl = `${window.location.origin}?session=${sessionId}`;
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleManualJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCodeInput.trim()) {
      onJoinSession(joinCodeInput.trim().toUpperCase());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0f1217] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-[#ccff00]/10 p-2 text-[#ccff00]">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                DEVICE PAIRING & MESH SYNC
              </h2>
              <p className="text-xs text-zinc-400">
                Connect multiple phones, tablets, or laptops to form a synchronized timing grid
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Tab Selector */}
          <div className="flex rounded-xl bg-zinc-900/80 p-1 border border-white/10">
            <button
              onClick={() => setActiveTab("qr")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                activeTab === "qr"
                  ? "bg-[#ccff00] text-black shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Pair Devices (QR / Code)
            </button>
            <button
              onClick={() => setActiveTab("join")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                activeTab === "join"
                  ? "bg-[#ccff00] text-black shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Join Another Session
            </button>
          </div>

          {activeTab === "qr" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-zinc-950 p-6 text-center">
                {qrDataUrl ? (
                  <div className="p-3 bg-[#ccff00] rounded-xl shadow-[0_0_25px_rgba(204,255,0,0.25)]">
                    <img
                      src={qrDataUrl}
                      alt="Session QR Code"
                      className="h-44 w-44 rounded-lg object-contain"
                    />
                  </div>
                ) : (
                  <div className="h-48 w-48 flex items-center justify-center rounded-lg bg-zinc-900 text-zinc-500 text-xs">
                    Generating QR...
                  </div>
                )}
                <span className="mt-3 text-[11px] font-mono text-zinc-400">
                  Scan with another phone's camera
                </span>
              </div>

              {/* Session Code & Share */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                    Session Pairing Code
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 rounded-xl border border-[#ccff00]/30 bg-[#ccff00]/5 px-4 py-3 text-center font-mono text-2xl font-black tracking-widest text-[#ccff00]">
                      {sessionId}
                    </div>
                    <button
                      onClick={copyShareLink}
                      className="rounded-xl border border-white/10 bg-zinc-900 p-3.5 text-zinc-300 hover:border-white/25 hover:text-white transition-all"
                      title="Copy join link"
                    >
                      {copiedLink ? (
                        <Check className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <Copy className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3.5 text-xs text-zinc-300 space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Radio className="h-4 w-4 text-[#ccff00]" />
                    Real-Time Mesh Synchronization
                  </div>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    Devices communicate over local low-latency network with NTP clock offsets. No role is locked—reassign start/finish roles anytime below.
                  </p>
                </div>

                <button
                  onClick={onTriggerClockSync}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:border-[#ccff00]/50 hover:text-white transition-all"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-[#ccff00]" />
                  Recalibrate Clock Sync (RTT Ping)
                </button>
              </div>
            </div>
          ) : (
            /* Join Session Form */
            <form onSubmit={handleManualJoin} className="space-y-4">
              <div>
                <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                  Enter Host Session Code
                </label>
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. PACE-782"
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-3 font-mono text-lg font-bold text-[#ccff00] placeholder:text-zinc-600 focus:border-[#ccff00] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-[#ccff00] py-3 text-sm font-bold text-black shadow-lg hover:bg-[#b8e600] transition-colors"
              >
                Join Timing Session
              </button>
            </form>
          )}

          {/* Connected Devices List */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-[#ccff00]" />
                Connected Devices ({connectedDevices.length})
              </h3>
              <span className="text-[11px] font-mono text-zinc-500">
                Active Timing Grid
              </span>
            </div>

            <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-zinc-950">
              {connectedDevices.map((device) => {
                return (
                  <div
                    key={device.deviceId}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative rounded-lg bg-zinc-900 border border-white/10 p-2 text-zinc-300">
                        <Camera className="h-4 w-4" />
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {device.deviceName}
                          </span>
                          {device.isAuthority && (
                            <span className="rounded bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-mono text-amber-300">
                              CLOCK HOST
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 mt-0.5">
                          <span>RTT: {device.syncQuality.rttMs}ms</span>
                          <span>•</span>
                          <span>Offset: {device.syncQuality.clockOffsetMs}ms</span>
                          <span>•</span>
                          <span className="text-[#ccff00]">
                            {device.syncQuality.quality.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Role Reassignment Dropdown */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <select
                        value={device.deviceRole}
                        onChange={(e) =>
                          onAssignRole(device.deviceId, e.target.value as DeviceRole)
                        }
                        className="w-full sm:w-auto rounded-lg border border-white/15 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 focus:border-[#ccff00] focus:outline-none"
                      >
                        <option value="master_console">Coach Console</option>
                        <option value="start_camera">Start Camera</option>
                        <option value="finish_camera">Finish Camera</option>
                        <option value="split_camera">Split Camera</option>
                        <option value="lap_camera">Lap Camera</option>
                        <option value="secondary_camera">Aux Camera</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-6 py-3.5 bg-zinc-950 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-[#ccff00] px-5 py-2 text-xs font-bold text-black hover:bg-[#b8e600] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

