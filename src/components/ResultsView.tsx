"use client";

import React, { useState } from "react";
import {
  Award,
  Download,
  Share2,
  Calendar,
  User,
  Zap,
  Gauge,
  ShieldCheck,
  CheckCircle,
  Eye,
  Camera,
  Activity,
  ArrowRight,
  Maximize2,
  ChevronLeft,
  RotateCcw,
} from "lucide-react";
import { TimingResult } from "@/types";
import { StorageDB } from "@/lib/storage/db";

interface ResultsViewProps {
  result: TimingResult | null;
  onBackToConsole: () => void;
  onNewAttempt: () => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  result,
  onBackToConsole,
  onNewAttempt,
}) => {
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [frameTitle, setFrameTitle] = useState<string>("");

  if (!result) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#0a0c0f] pb-20 md:pb-6">
        <Award className="h-10 w-10 text-zinc-600 mb-2" />
        <h3 className="text-sm font-bold text-white mb-1">No Active Result</h3>
        <p className="text-[11px] text-zinc-400 mb-4 max-w-xs">
          Run an athletic timing attempt in the Live Console to log photo-finish evidence.
        </p>
        <button
          onClick={onBackToConsole}
          className="rounded-xl bg-[#ccff00] px-4 py-2 text-xs font-bold text-black"
        >
          Go to Live Console
        </button>
      </div>
    );
  }

  const totalSec = (result.totalTimeMs / 1000).toFixed(3);
  const dateStr = new Date(result.recordedAt).toLocaleString();

  const avgSpeedKmh =
    result.distanceMeters && result.totalTimeMs > 0
      ? ((result.distanceMeters / (result.totalTimeMs / 1000)) * 3.6).toFixed(2)
      : null;

  const avgSpeedMs =
    result.distanceMeters && result.totalTimeMs > 0
      ? (result.distanceMeters / (result.totalTimeMs / 1000)).toFixed(2)
      : null;

  const handleExportCSV = () => {
    StorageDB.exportResultsToCSV([result]);
  };

  const evidenceFrames: Array<{ label: string; src: string }> = [];
  if (result.videoEvidence?.startFrame) {
    evidenceFrames.push({ label: "Start Gate Crossing", src: result.videoEvidence.startFrame });
  }
  if (result.videoEvidence?.splitFrames) {
    Object.entries(result.videoEvidence.splitFrames).forEach(([idx, src]) => {
      evidenceFrames.push({ label: `Split #${idx} Crossing`, src });
    });
  }
  if (result.videoEvidence?.finishFrame) {
    evidenceFrames.push({ label: "Finish Gate Crossing", src: result.videoEvidence.finishFrame });
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0c0f] p-3 sm:p-6 max-w-7xl mx-auto w-full overflow-y-auto pb-20 md:pb-6">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          onClick={onBackToConsole}
          className="flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 active:scale-95"
        >
          <ChevronLeft className="h-4 w-4" />
          Console
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 rounded-xl border border-white/15 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 active:scale-95"
          >
            <Download className="h-3.5 w-3.5 text-[#ccff00]" />
            CSV
          </button>
          <button
            onClick={onNewAttempt}
            className="flex items-center gap-1 rounded-xl bg-[#ccff00] px-3.5 py-1.5 text-xs font-bold text-black active:scale-95"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Next Run
          </button>
        </div>
      </div>

      {/* Main Result Certificate */}
      <div className="rounded-3xl border border-white/15 bg-gradient-to-b from-[#141820] to-[#0d0f14] p-4 sm:p-8 shadow-2xl relative overflow-hidden mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="rounded bg-[#ccff00]/15 border border-[#ccff00]/30 px-1.5 py-0.2 text-[9px] font-mono font-bold text-[#ccff00] uppercase">
                Official Electronic Chrono
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">{dateStr}</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black text-white tracking-wide truncate">
              {result.athleteName}
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              {result.eventName} • {result.startMethod === "hold_and_release" ? "Hold & Release" : "Camera Auto"}
              {result.distanceMeters ? ` • ${result.distanceMeters}m` : ""}
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              OFFICIAL SPRINT TIME
            </span>
            <div className="font-mono text-4xl sm:text-6xl font-black tracking-tight text-[#ccff00] drop-shadow-[0_0_25px_rgba(204,255,0,0.25)]">
              {totalSec}
              <span className="text-lg sm:text-xl text-zinc-400 ml-1 font-sans">s</span>
            </div>
          </div>
        </div>

        {/* Speed & Interval Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 mt-5">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3 sm:p-4">
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block mb-0.5">
              Avg Velocity
            </span>
            <div className="text-base sm:text-xl font-black text-white">
              {avgSpeedKmh ? `${avgSpeedKmh} km/h` : "—"}
            </div>
            <span className="text-[10px] font-mono text-zinc-400">
              {avgSpeedMs ? `${avgSpeedMs} m/s` : "Distance free"}
            </span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3 sm:p-4">
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block mb-0.5">
              Uncertainty
            </span>
            <div className="text-base sm:text-xl font-black text-[#ccff00]">
              ±{result.uncertaintyMs} ms
            </div>
            <span className="text-[10px] font-mono text-zinc-400">
              Frame jitter
            </span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3 sm:p-4">
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block mb-0.5">
              Clock Sync
            </span>
            <div className="text-base sm:text-xl font-black text-white">
              {result.syncQuality.jitterMs} ms
            </div>
            <span className="text-[10px] font-mono text-zinc-400">
              RTT: {result.syncQuality.rttMs}ms
            </span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3 sm:p-4">
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block mb-0.5">
              Camera FPS
            </span>
            <div className="text-base sm:text-xl font-black text-white">
              {result.hardwareMetrics.cameraFps} FPS
            </div>
            <span className="text-[10px] font-mono text-zinc-400">
              Proc: {result.hardwareMetrics.processingFps} FPS
            </span>
          </div>
        </div>
      </div>

      {/* Photo-Finish Evidence Section */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 sm:p-6 shadow-xl mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Camera className="h-4 w-4 text-[#ccff00]" />
            Photo-Finish Video Evidence ({evidenceFrames.length})
          </h3>
          <span className="text-[10px] font-mono text-zinc-500">
            Tap to zoom
          </span>
        </div>

        {evidenceFrames.length === 0 ? (
          <div className="py-6 text-center text-xs font-mono text-zinc-500">
            No video frames captured for this run.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {evidenceFrames.map((frame, i) => (
              <div
                key={i}
                onClick={() => {
                  setSelectedFrame(frame.src);
                  setFrameTitle(frame.label);
                }}
                className="group relative rounded-xl border border-white/10 bg-zinc-900 overflow-hidden cursor-pointer hover:border-[#ccff00]/60 active:scale-98 transition-all shadow-md"
              >
                <img
                  src={frame.src}
                  alt={frame.label}
                  className="w-full h-36 sm:h-44 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2.5">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-bold text-white">{frame.label}</span>
                    <Maximize2 className="h-3.5 w-3.5 text-[#ccff00]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zoom Modal for Photo Finish */}
      {selectedFrame && (
        <div
          onClick={() => setSelectedFrame(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full rounded-2xl border border-white/20 bg-[#0f1217] overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5 bg-zinc-950">
              <span className="text-[11px] font-mono font-bold text-[#ccff00]">
                {frameTitle.toUpperCase()}
              </span>
              <button
                onClick={() => setSelectedFrame(null)}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-1 bg-black flex items-center justify-center">
              <img
                src={selectedFrame}
                alt="Zoomed"
                className="max-h-[70vh] w-full object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
