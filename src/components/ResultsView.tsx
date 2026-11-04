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
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#0a0c0f]">
        <Award className="h-12 w-12 text-zinc-600 mb-3" />
        <h3 className="text-base font-bold text-white mb-1">No Active Result Available</h3>
        <p className="text-xs text-zinc-400 mb-4 max-w-sm">
          Run an athletic timing attempt in the Live Console to capture sprint records and photo-finish evidence.
        </p>
        <button
          onClick={onBackToConsole}
          className="rounded-xl bg-[#ccff00] px-5 py-2.5 text-xs font-bold text-black"
        >
          Go to Live Console
        </button>
      </div>
    );
  }

  const totalSec = (result.totalTimeMs / 1000).toFixed(3);
  const dateStr = new Date(result.recordedAt).toLocaleString();

  // Speed calculations
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

  const getQualityBadge = () => {
    switch (result.timingQuality) {
      case "validated_camera":
        return {
          bg: "bg-emerald-950/70 border-emerald-500/40 text-emerald-400",
          label: "VALIDATED CAMERA TIMING",
          description: "Torso crossing confirmed by sub-frame computer vision and synchronized clock.",
        };
      case "high_confidence":
        return {
          bg: "bg-lime-950/70 border-lime-500/40 text-lime-400",
          label: "HIGH CONFIDENCE TIMING",
          description: "Torso trajectory verified with acceptable network clock offset.",
        };
      default:
        return {
          bg: "bg-amber-950/70 border-amber-500/40 text-amber-400",
          label: "PROVISIONAL TIMING",
          description: "Elevated uncertainty due to clock drift or partial occlusion.",
        };
    }
  };

  const qualityBadge = getQualityBadge();

  // Collect evidence snapshots
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
    <div className="flex-1 flex flex-col h-full bg-[#0a0c0f] p-3 sm:p-6 max-w-7xl mx-auto w-full overflow-y-auto">
      {/* Navigation Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBackToConsole}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Live Console
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-white/25 hover:text-white transition-all"
          >
            <Download className="h-4 w-4 text-[#ccff00]" />
            Export CSV
          </button>
          <button
            onClick={onNewAttempt}
            className="flex items-center gap-1.5 rounded-xl bg-[#ccff00] px-4 py-2 text-xs font-bold text-black hover:bg-[#b8e600] transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Next Attempt
          </button>
        </div>
      </div>

      {/* Main Result Certificate */}
      <div className="rounded-3xl border border-white/15 bg-gradient-to-b from-[#141820] to-[#0d0f14] p-6 sm:p-10 shadow-2xl relative overflow-hidden mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/10 pb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded bg-[#ccff00]/15 border border-[#ccff00]/30 px-2 py-0.5 text-[10px] font-mono font-bold text-[#ccff00] uppercase">
                Official Electronic Chrono
              </span>
              <span className="text-xs text-zinc-500 font-mono">{dateStr}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
              {result.athleteName}
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              {result.eventName} • {result.startMethod === "hold_and_release" ? "Hold & Release" : "Camera Auto"}
              {result.distanceMeters ? ` • ${result.distanceMeters}m` : ""}
            </p>
          </div>

          {/* Primary Time Display */}
          <div className="flex flex-col items-start md:items-end">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
              OFFICIAL SPRINT TIME
            </span>
            <div className="font-mono text-5xl sm:text-7xl font-black tracking-tight text-[#ccff00] drop-shadow-[0_0_35px_rgba(204,255,0,0.25)]">
              {totalSec}
              <span className="text-xl sm:text-2xl text-zinc-400 ml-1 font-sans">s</span>
            </div>
          </div>
        </div>

        {/* Speed & Interval Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
              Average Velocity
            </span>
            <div className="text-xl font-black text-white">
              {avgSpeedKmh ? `${avgSpeedKmh} km/h` : "—"}
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              {avgSpeedMs ? `${avgSpeedMs} m/s` : "Distance independent"}
            </span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
              Timing Uncertainty
            </span>
            <div className="text-xl font-black text-[#ccff00]">
              ±{result.uncertaintyMs} ms
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              Scientific frame jitter
            </span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
              Mesh Clock Sync
            </span>
            <div className="text-xl font-black text-white">
              {result.syncQuality.jitterMs} ms
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              RTT: {result.syncQuality.rttMs}ms • {result.syncQuality.quality}
            </span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
              Sensor Camera FPS
            </span>
            <div className="text-xl font-black text-white">
              {result.hardwareMetrics.cameraFps} FPS
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              Proc: {result.hardwareMetrics.processingFps} FPS
            </span>
          </div>
        </div>

        {/* Quality & Integrity Statement */}
        <div className={`mt-6 rounded-2xl border p-4 ${qualityBadge.bg}`}>
          <div className="flex items-center gap-2 font-bold text-xs">
            <ShieldCheck className="h-4 w-4" />
            <span>{qualityBadge.label}</span>
          </div>
          <p className="mt-1 text-xs opacity-90 leading-relaxed">
            {qualityBadge.description} PACEFRAME computes real-world camera frame timestamps and empirical clock jitter rather than fabricating unverified milliseconds.
          </p>
        </div>
      </div>

      {/* Photo-Finish Evidence Section */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Camera className="h-4 w-4 text-[#ccff00]" />
            Photo-Finish Video Evidence Frames ({evidenceFrames.length})
          </h3>
          <span className="text-[11px] font-mono text-zinc-500">
            Click frame to zoom full-resolution
          </span>
        </div>

        {evidenceFrames.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-zinc-500">
            No video frames were captured for this session.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {evidenceFrames.map((frame, i) => (
              <div
                key={i}
                onClick={() => {
                  setSelectedFrame(frame.src);
                  setFrameTitle(frame.label);
                }}
                className="group relative rounded-xl border border-white/10 bg-zinc-900 overflow-hidden cursor-pointer hover:border-[#ccff00]/60 transition-all shadow-md"
              >
                <img
                  src={frame.src}
                  alt={frame.label}
                  className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-white">{frame.label}</span>
                    <Maximize2 className="h-4 w-4 text-[#ccff00] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Split Times Table */}
      {result.splitTimes.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-xl">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
            Split Interval Analysis
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] text-zinc-400 uppercase">
                  <th className="pb-2">Split Gate</th>
                  <th className="pb-2">Interval</th>
                  <th className="pb-2">Cumulative</th>
                  <th className="pb-2">Interval Speed</th>
                  <th className="pb-2">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {result.splitTimes.map((s) => (
                  <tr key={s.index}>
                    <td className="py-2.5 font-bold text-white font-sans">{s.name}</td>
                    <td className="py-2.5 text-[#ccff00] font-bold">
                      {(s.splitTimeMs / 1000).toFixed(3)}s
                    </td>
                    <td className="py-2.5 text-zinc-300">
                      {(s.elapsedMs / 1000).toFixed(3)}s
                    </td>
                    <td className="py-2.5 text-zinc-400">
                      {s.speedKmh ? `${s.speedKmh} km/h` : "—"}
                    </td>
                    <td className="py-2.5 text-emerald-400">
                      {(s.confidence * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Zoom Modal for Photo Finish */}
      {selectedFrame && (
        <div
          onClick={() => setSelectedFrame(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full rounded-2xl border border-white/20 bg-[#0f1217] overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-zinc-950">
              <span className="text-xs font-mono font-bold text-[#ccff00]">
                {frameTitle.toUpperCase()} // PHOTO-FINISH TELEMETRY
              </span>
              <button
                onClick={() => setSelectedFrame(null)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Close [ESC]
              </button>
            </div>
            <div className="p-2 bg-black flex items-center justify-center">
              <img src={selectedFrame} alt="Zoomed Frame" className="max-h-[75vh] object-contain rounded" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

