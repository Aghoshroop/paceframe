"use client";

import React, { useState, useEffect } from "react";
import { QrCode, X, Copy, Check, Radio, Camera, ShieldCheck, Flag, Zap, Clock } from "lucide-react";
import QRCode from "qrcode";
import { DeviceRole, ConnectedDevice } from "@/types";

interface GateQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  connectedDevices: ConnectedDevice[];
  initialRole?: DeviceRole;
}

export const GateQRModal: React.FC<GateQRModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  connectedDevices,
  initialRole = "finish_camera",
}) => {
  const [selectedRole, setSelectedRole] = useState<DeviceRole>(initialRole);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [joinUrl, setJoinUrl] = useState<string>("");

  useEffect(() => {
    if (initialRole) {
      setSelectedRole(initialRole);
    }
  }, [initialRole]);

  useEffect(() => {
    if (!isOpen) return;

    let baseUrl = "";
    if (typeof window !== "undefined") {
      baseUrl = window.location.origin + window.location.pathname;
    }
    const fullUrl = `${baseUrl}?session=${sessionId}&role=${selectedRole}`;
    setJoinUrl(fullUrl);

    QRCode.toDataURL(fullUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("QR Code generation error:", err));
  }, [isOpen, sessionId, selectedRole]);

  const copyUrlToClipboard = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(joinUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Find if a device with this role is currently connected
  const connectedDeviceForRole = connectedDevices.find((d) => d.deviceRole === selectedRole);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-zinc-950 p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-[#ccff00]/15 p-2 text-[#ccff00]">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Attach Gate Device
              </h3>
              <p className="text-[11px] text-zinc-400">
                Session {sessionId} • Pair another phone as camera sensor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Role Selector Tabs (Finish / Start / Flying Split) */}
        <div className="my-4 grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-zinc-900 border border-white/10 text-xs font-mono">
          <button
            onClick={() => setSelectedRole("finish_camera")}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all ${
              selectedRole === "finish_camera"
                ? "bg-[#ccff00] text-black font-black shadow-lg"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Flag className="h-4 w-4 mb-1" />
            <span className="text-[10px] uppercase">Finish Gate</span>
          </button>

          <button
            onClick={() => setSelectedRole("start_camera")}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all ${
              selectedRole === "start_camera"
                ? "bg-[#ccff00] text-black font-black shadow-lg"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Zap className="h-4 w-4 mb-1" />
            <span className="text-[10px] uppercase">Start Gate</span>
          </button>

          <button
            onClick={() => setSelectedRole("split_camera")}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all ${
              selectedRole === "split_camera"
                ? "bg-[#ccff00] text-black font-black shadow-lg"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Clock className="h-4 w-4 mb-1" />
            <span className="text-[10px] uppercase">Flying Split</span>
          </button>
        </div>

        {/* QR Code Container */}
        <div className="relative flex flex-col items-center justify-center p-4 rounded-2xl bg-white shadow-inner">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Pairing QR Code"
              className="h-56 w-56 object-contain"
            />
          ) : (
            <div className="h-56 w-56 flex items-center justify-center font-mono text-xs text-zinc-500">
              Generating Code...
            </div>
          )}

          {/* Connected Overlay Badge */}
          {connectedDeviceForRole && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-xs rounded-2xl p-4 text-center animate-in fade-in">
              <ShieldCheck className="h-12 w-12 text-[#ccff00] mb-2" />
              <h4 className="text-base font-black text-white uppercase">
                Device Connected!
              </h4>
              <p className="text-xs text-zinc-300 mt-1 font-mono">
                {connectedDeviceForRole.deviceName} is locked as{" "}
                <span className="text-[#ccff00] font-bold">
                  {selectedRole === "finish_camera"
                    ? "Finish Gate"
                    : selectedRole === "start_camera"
                    ? "Start Gate"
                    : "Flying Split"}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Pairing Instructions & Status */}
        <div className="mt-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-mono text-[11px]">
              Status:
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectedDeviceForRole
                    ? "bg-[#ccff00] animate-pulse"
                    : "bg-amber-400 animate-ping"
                }`}
              />
              <span className={connectedDeviceForRole ? "text-[#ccff00] font-bold" : "text-amber-300"}>
                {connectedDeviceForRole
                  ? `Active (${connectedDeviceForRole.deviceName})`
                  : "Waiting for device to scan..."}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-zinc-400 text-center leading-relaxed font-sans">
            Open PACEFRAME on your second phone and tap{" "}
            <strong className="text-white">Scan QR</strong>, or point your phone camera at this screen.
          </p>

          {/* Copy Link Button */}
          <button
            onClick={copyUrlToClipboard}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-zinc-900 py-2.5 px-4 text-xs font-bold text-zinc-200 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all"
          >
            {copiedLink ? (
              <>
                <Check className="h-4 w-4 text-[#ccff00]" />
                <span className="text-[#ccff00]">Pair Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Copy Direct Pair Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

