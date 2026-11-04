"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  Download,
  Search,
  Filter,
  User,
  Award,
  ChevronRight,
  Trash2,
  Calendar,
  Zap,
} from "lucide-react";
import { TimingResult, Athlete } from "@/types";
import { StorageDB } from "@/lib/storage/db";

interface HistoryViewProps {
  onInspectResult: (result: TimingResult) => void;
  athletes: Athlete[];
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onInspectResult,
  athletes,
}) => {
  const [results, setResults] = useState<TimingResult[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedAthleteFilter, setSelectedAthleteFilter] = useState<string>("ALL");

  useEffect(() => {
    setResults(StorageDB.getResults());
  }, []);

  const handleExportAll = () => {
    StorageDB.exportResultsToCSV(results);
  };

  const filteredResults = results.filter((r) => {
    const matchesSearch =
      r.athleteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.eventName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAthlete =
      selectedAthleteFilter === "ALL" || r.athleteId === selectedAthleteFilter;

    return matchesSearch && matchesAthlete;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0c0f] p-3 sm:p-6 max-w-7xl mx-auto w-full overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2.5">
            <History className="h-5 w-5 text-[#ccff00]" />
            SESSION HISTORY & SPRINT LOGS
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Complete database of electronic sprint timings, sub-frame photo-finish records, and splits
          </p>
        </div>

        <button
          onClick={handleExportAll}
          disabled={results.length === 0}
          className="flex items-center gap-2 rounded-xl bg-[#ccff00] px-4 py-2 text-xs font-bold text-black hover:bg-[#b8e600] disabled:opacity-40 transition-all shadow-md"
        >
          <Download className="h-4 w-4" />
          Export All to CSV
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by athlete or event..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-zinc-950 pl-10 pr-4 py-2.5 text-xs text-white focus:border-[#ccff00] focus:outline-none"
          />
        </div>

        <select
          value={selectedAthleteFilter}
          onChange={(e) => setSelectedAthleteFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-xs font-semibold text-zinc-200 focus:border-[#ccff00] focus:outline-none"
        >
          <option value="ALL">All Athletes ({athletes.length})</option>
          {athletes.map((a) => (
            <option key={a.athleteId} value={a.athleteId}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Results Table */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 shadow-xl overflow-hidden">
        {filteredResults.length === 0 ? (
          <div className="py-16 text-center">
            <Award className="h-10 w-10 text-zinc-600 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-zinc-400">No Sprint Attempts Recorded Yet</h4>
            <p className="text-xs text-zinc-600 mt-1">
              Start a timing attempt from the Live Console to log electronic records.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-zinc-900/60 text-[10px] text-zinc-400 uppercase">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Athlete</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Avg Speed</th>
                  <th className="py-3 px-4">Splits</th>
                  <th className="py-3 px-4">Integrity / Uncertainty</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredResults.map((r) => {
                  const dateStr = new Date(r.recordedAt).toLocaleDateString();
                  const timeSec = (r.totalTimeMs / 1000).toFixed(3);
                  const speed =
                    r.distanceMeters && r.totalTimeMs > 0
                      ? `${((r.distanceMeters / (r.totalTimeMs / 1000)) * 3.6).toFixed(1)} km/h`
                      : "—";

                  return (
                    <tr
                      key={r.resultId}
                      onClick={() => onInspectResult(r)}
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 text-zinc-400">{dateStr}</td>
                      <td className="py-3.5 px-4 font-bold text-white font-sans">
                        {r.athleteName}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-300">
                        {r.eventName}
                        {r.distanceMeters ? ` (${r.distanceMeters}m)` : ""}
                      </td>
                      <td className="py-3.5 px-4 font-black text-[#ccff00] text-sm">
                        {timeSec}s
                      </td>
                      <td className="py-3.5 px-4 text-zinc-300">{speed}</td>
                      <td className="py-3.5 px-4 text-zinc-400">
                        {r.splitTimes.length > 0 ? `${r.splitTimes.length} splits` : "Direct"}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                          ±{r.uncertaintyMs}ms
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#ccff00] hover:underline">
                          Evidence <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

