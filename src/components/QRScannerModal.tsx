"use client";

import React, { useState, useEffect, useRef } from "react";
import { Camera, X, SwitchCamera, AlertCircle, CheckCircle2 } from "lucide-react";
import jsQR from "jsqr";

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (sessionId: string, role?: string) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setScannedResult(null);
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    stopCamera();
    setErrorMessage(null);

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
        setHasPermission(true);
        startScanningLoop();
      }
    } catch (err: any) {
      console.warn("Scanner camera access error:", err);
      setHasPermission(false);
      setErrorMessage(err?.message || "Camera access denied. Please grant permission.");
    }
  };

  const stopCamera = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startScanningLoop = () => {
    const scan = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.readyState >= 2 && canvas) {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // Use jsQR to decode any QR code in the frame
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data) {
            handleCodeFound(code.data);
            return;
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(scan);
    };

    animFrameRef.current = requestAnimationFrame(scan);
  };

  const handleCodeFound = (data: string) => {
    setScannedResult(data);
    stopCamera();

    // Haptic feedback
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([80, 50, 100]);
      } catch {}
    }

    try {
      // Check if it's a URL like https://.../?session=PACE-101&role=finish_camera
      if (data.includes("session=")) {
        const url = new URL(data.startsWith("http") ? data : `http://dummy.com/${data}`);
        const sessionId = url.searchParams.get("session") || "PACE-101";
        const role = url.searchParams.get("role") || undefined;
        setTimeout(() => {
          onScanSuccess(sessionId.toUpperCase(), role);
          onClose();
        }, 500);
        return;
      }

      // Check if it's a direct JSON payload
      if (data.startsWith("{") && data.endsWith("}")) {
        const parsed = JSON.parse(data);
        if (parsed.session || parsed.sessionId) {
          const sId = parsed.session || parsed.sessionId;
          setTimeout(() => {
            onScanSuccess(sId.toUpperCase(), parsed.role);
            onClose();
          }, 500);
          return;
        }
      }

      // Raw session string
      setTimeout(() => {
        onScanSuccess(data.trim().toUpperCase());
        onClose();
      }, 500);
    } catch {
      setTimeout(() => {
        onScanSuccess(data.trim().toUpperCase());
        onClose();
      }, 500);
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-zinc-950 p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-[#ccff00]/15 p-2 text-[#ccff00]">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Scan Console QR Code
              </h3>
              <p className="text-[11px] text-zinc-400">
                Point at Console screen to pair this device
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

        {/* Camera Viewfinder */}
        <div className="relative my-4 aspect-square w-full overflow-hidden rounded-2xl bg-black border border-white/10 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanner Reticle Overlay */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-56 w-56 rounded-2xl border-2 border-dashed border-[#ccff00]/80 shadow-[0_0_30px_rgba(204,255,0,0.3)]">
              {/* Corner brackets */}
              <div className="absolute -top-1 -left-1 h-6 w-6 border-t-4 border-l-4 border-[#ccff00]" />
              <div className="absolute -top-1 -right-1 h-6 w-6 border-t-4 border-r-4 border-[#ccff00]" />
              <div className="absolute -bottom-1 -left-1 h-6 w-6 border-b-4 border-l-4 border-[#ccff00]" />
              <div className="absolute -bottom-1 -right-1 h-6 w-6 border-b-4 border-r-4 border-[#ccff00]" />

              {/* Scanning red/green laser line animation */}
              <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-[#ccff00] shadow-[0_0_12px_#ccff00] animate-pulse" />
            </div>
          </div>

          {/* Scanned Success Confirmation */}
          {scannedResult && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-4 text-center z-20">
              <CheckCircle2 className="h-12 w-12 text-[#ccff00] mb-2 animate-bounce" />
              <h4 className="text-base font-black text-white uppercase">
                Device Paired!
              </h4>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                Connecting to timing session...
              </p>
            </div>
          )}

          {/* Permission error */}
          {hasPermission === false && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/95 p-5 text-center">
              <AlertCircle className="h-10 w-10 text-amber-400 mb-2" />
              <p className="text-xs text-zinc-300 mb-3">{errorMessage}</p>
              <button
                onClick={startCamera}
                className="rounded-xl bg-white text-black px-4 py-2 text-xs font-bold"
              >
                Allow Camera Permission
              </button>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="font-mono text-[10px]">
            Align QR code inside the green brackets
          </span>
          <button
            onClick={toggleCameraFacing}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-1.5 text-zinc-300 hover:text-white active:scale-95"
          >
            <SwitchCamera className="h-3.5 w-3.5" />
            Flip
          </button>
        </div>
      </div>
    </div>
  );
};

