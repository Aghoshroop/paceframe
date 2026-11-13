"use client";

import React, { useState, useEffect } from "react";
import { QrCode, X, Copy, Check, ShieldCheck, Flag, Zap, Clock, Wifi, Edit2 } from "lucide-react";
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

  // Custom LAN host override for testing with phone over local WiFi
  const [customHost, setCustomHost] = useState<string>("");
  const [isEditingHost, setIsEditingHost] = useState(false);

  useEffect(() => {
    if (initialRole) {
      setSelectedRole(initialRole);
    }
  }, [initialRole]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("paceframe_lan_host");
      if (stored) {
        setCustomHost(stored);
      } else if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        setCustomHost("10.179.46.160:3000");
      } else {
        setCustomHost(window.location.host);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    let baseUrl = "";
    if (typeof window !== "undefined") {
      const protocol = window.location.protocol;
      const host = customHost.trim() || window.location.host;
      baseUrl = `${protocol}//${host}${window.location.pathname}`;
    }

    const fullUrl = `${baseUrl}?session=${sessionId.trim().toUpperCase()}&role=${selectedRole}`;
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
  }, [isOpen, sessionId, selectedRole, customHost]);

  const copyUrlToClipboard = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(joinUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleHostChange = (newVal: string) => {
    setCustomHost(newVal);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("paceframe_lan_host", newVal);
    }
  };

  // Find if a remote device with this role is currently connected
  const connectedDeviceForRole =
    connectedDevices.find((d) => !d.isAuthority && d.deviceRole === selectedRole) ||
    (selectedRole === "finish_camera"
      ? connectedDevices.find((d) => !d.isAuthority && d.deviceRole === "secondary_camera")
      : undefined);

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
                Attach Remote Gate Camera
              </h3>
              <p className="text-[11px] text-zinc-400">
                Session {sessionId} • Pair another phone as optical sensor
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
        <div className="my-3.5 grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-zinc-900 border border-white/10 text-xs font-mono">
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
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xs rounded-2xl p-4 text-center animate-in fade-in">
              <ShieldCheck className="h-12 w-12 text-[#ccff00] mb-2 animate-bounce" />
              <h4 className="text-base font-black text-white uppercase">
                Device Connected & Armed!
              </h4>
              <p className="text-xs text-zinc-300 mt-1 font-mono">
                {connectedDeviceForRole.deviceName} is live as{" "}
                <strong className="text-[#ccff00]">
                  {selectedRole === "finish_camera"
                    ? "Finish Gate Sensor"
                    : selectedRole === "start_camera"
                    ? "Start Gate Sensor"
                    : "Flying Split Sensor"}
                </strong>
              </p>
              <button
                onClick={onClose}
                className="mt-4 rounded-xl bg-[#ccff00] text-black px-4 py-2 text-xs font-black uppercase tracking-wider active:scale-95"
              >
                Close & Ready for Sprint
              </button>
            </div>
          )}
        </div>

        {/* Network Host Configuration for WiFi Phones */}
        <div className="mt-2.5 rounded-xl border border-white/10 bg-zinc-900/60 p-2 text-xs">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1 font-mono">
              <Wifi className="h-3 w-3 text-[#ccff00]" />
              WiFi Host IP:
            </span>
            <button
              onClick={() => setIsEditingHost(!isEditingHost)}
              className="text-[#ccff00] hover:underline flex items-center gap-0.5 text-[10px] font-mono"
            >
              <Edit2 className="h-2.5 w-2.5" />
              <span>{isEditingHost ? "Done" : "Change IP"}</span>
            </button>
          </div>

          {isEditingHost ? (
            <input
              type="text"
              value={customHost}
              onChange={(e) => handleHostChange(e.target.value)}
              placeholder="e.g. 10.179.46.160:3000"
              className="mt-1 w-full rounded bg-black border border-white/20 px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-[#ccff00]"
            />
          ) : (
            <div className="mt-0.5 text-[11px] font-mono font-bold text-white truncate">
              http://{customHost}
            </div>
          )}
        </div>

        {/* Pairing Instructions & Status */}
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-mono text-[11px]">
              Live Connection Status:
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
                  ? `Connected (${connectedDeviceForRole.deviceName})`
                  : "Waiting for phone to scan..."}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-zinc-400 text-center leading-relaxed font-sans">
            On your secondary phone, open PACEFRAME and tap{" "}
            <strong className="text-white">Scan QR</strong>, or point your phone camera at this code.
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
