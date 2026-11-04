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
        width: 240,
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#0f1217] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-[#ccff00]/10 p-1.5 sm:p-2 text-[#ccff00]">
              <QrCode className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                DEVICE PAIRING & MESH
              </h2>
              <p className="text-[10px] sm:text-xs text-zinc-400">
                Synchronize multiple cameras into one timing grid
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6">
          {/* Tab Selector */}
          <div className="flex rounded-xl bg-zinc-900/80 p-1 border border-white/10">
            <button
              onClick={() => setActiveTab("qr")}
              className={`flex-1 rounded-lg py-1.5 sm:py-2 text-xs font-semibold transition-all ${
                activeTab === "qr"
                  ? "bg-[#ccff00] text-black shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Pair Devices (QR)
            </button>
            <button
              onClick={() => setActiveTab("join")}
              className={`flex-1 rounded-lg py-1.5 sm:py-2 text-xs font-semibold transition-all ${
                activeTab === "join"
                  ? "bg-[#ccff00] text-black shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Join Other Session
            </button>
          </div>

          {activeTab === "qr" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-center">
              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-zinc-950 p-4 sm:p-6 text-center">
                {qrDataUrl ? (
                  <div className="p-2 sm:p-3 bg-[#ccff00] rounded-xl shadow-[0_0_20px_rgba(204,255,0,0.2)]">
                    <img
                      src={qrDataUrl}
                      alt="Session QR Code"
                      className="h-36 w-36 sm:h-44 sm:w-44 rounded-lg object-contain"
                    />
                  </div>
                ) : (
                  <div className="h-36 w-36 sm:h-44 sm:w-44 flex items-center justify-center rounded-lg bg-zinc-900 text-zinc-500 text-xs">
                    Generating QR...
                  </div>
                )}
                <span className="mt-2 text-[10px] font-mono text-zinc-400">
                  Scan with another phone's camera
                </span>
              </div>

              {/* Session Code & Share */}
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                    Pairing Code
                  </label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="flex-1 rounded-xl border border-[#ccff00]/30 bg-[#ccff00]/5 px-3 py-2 text-center font-mono text-xl sm:text-2xl font-black tracking-widest text-[#ccff00]">
                      {sessionId}
                    </div>
                    <button
                      onClick={copyShareLink}
                      className="rounded-xl border border-white/10 bg-zinc-900 p-2.5 sm:p-3 text-zinc-300 hover:text-white active:scale-95 transition-all"
                      title="Copy link"
                    >
                      {copiedLink ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={onTriggerClockSync}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 active:scale-95 transition-all"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-[#ccff00]" />
                  Recalibrate Clock Sync (RTT Ping)
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualJoin} className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  Host Session Code
                </label>
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. PACE-101"
                  className="mt-1 w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-2.5 font-mono text-base font-bold text-[#ccff00] placeholder:text-zinc-600 focus:border-[#ccff00] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-[#ccff00] py-2.5 text-xs font-bold text-black shadow-lg hover:bg-[#b8e600] active:scale-95"
              >
                Join Session
              </button>
            </form>
          )}

          {/* Connected Devices List */}
          <div className="space-y-2 pt-1">
            <h3 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-[#ccff00]" />
              Timing Grid Devices ({connectedDevices.length})
            </h3>

            <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-zinc-950">
              {connectedDevices.map((device) => (
                <div
                  key={device.deviceId}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 sm:p-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative rounded-lg bg-zinc-900 border border-white/10 p-1.5 text-zinc-300">
                      <Camera className="h-3.5 w-3.5" />
                      <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate max-w-[150px] sm:max-w-none">
                          {device.deviceName}
                        </span>
                        {device.isAuthority && (
                          <span className="rounded bg-amber-500/20 border border-amber-500/30 px-1 py-0.2 text-[8px] font-mono text-amber-300">
                            HOST
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-400">
                        <span>RTT: {device.syncQuality.rttMs}ms</span>
                        <span>•</span>
                        <span className="text-[#ccff00]">
                          {device.syncQuality.quality.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <select
                    value={device.deviceRole}
                    onChange={(e) =>
                      onAssignRole(device.deviceId, e.target.value as DeviceRole)
                    }
                    className="w-full sm:w-auto rounded-lg border border-white/15 bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-zinc-200 focus:outline-none"
                  >
                    <option value="master_console">Coach Console</option>
                    <option value="start_camera">Start Camera</option>
                    <option value="finish_camera">Finish Camera</option>
                    <option value="split_camera">Split Camera</option>
                    <option value="lap_camera">Lap Camera</option>
                    <option value="secondary_camera">Aux Camera</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-4 py-3 bg-zinc-950 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl bg-[#ccff00] px-5 py-2 text-xs font-bold text-black"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
