"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  Download,
  Search,
  Award,
  ChevronRight,
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
    <div className="flex-1 flex flex-col h-full bg-[#0a0c0f] p-3 sm:p-6 max-w-7xl mx-auto w-full overflow-y-auto pb-20 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white tracking-wide flex items-center gap-2">
            <History className="h-4 w-4 sm:h-5 sm:w-5 text-[#ccff00]" />
            SESSION HISTORY & SPRINT LOGS
          </h2>
          <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
            Electronic sprint timings, sub-frame photo-finish records, and splits
          </p>
        </div>

        <button
          onClick={handleExportAll}
          disabled={results.length === 0}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-[#ccff00] px-3.5 py-2 text-xs font-bold text-black hover:bg-[#b8e600] active:scale-95 disabled:opacity-40 transition-all shadow-md"
        >
          <Download className="h-3.5 w-3.5" />
          Export All CSV
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search athlete or event..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-white focus:border-[#ccff00] focus:outline-none"
          />
        </div>

        <select
          value={selectedAthleteFilter}
          onChange={(e) => setSelectedAthleteFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-200 focus:border-[#ccff00] focus:outline-none"
        >
          <option value="ALL">All Athletes ({athletes.length})</option>
          {athletes.map((a) => (
            <option key={a.athleteId} value={a.athleteId}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Results List / Table */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 shadow-xl overflow-hidden">
        {filteredResults.length === 0 ? (
          <div className="py-12 text-center">
            <Award className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
            <h4 className="text-xs font-bold text-zinc-400">No Attempts Recorded Yet</h4>
            <p className="text-[11px] text-zinc-600 mt-0.5">
              Start a timing attempt from the Live Console to log electronic records.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-white/10 bg-zinc-900/60 text-[9px] text-zinc-400 uppercase">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Athlete</th>
                  <th className="py-2.5 px-3">Event</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Uncertainty</th>
                  <th className="py-2.5 px-3 text-right">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredResults.map((r) => {
                  const dateStr = new Date(r.recordedAt).toLocaleDateString();
                  const timeSec = (r.totalTimeMs / 1000).toFixed(3);

                  return (
                    <tr
                      key={r.resultId}
                      onClick={() => onInspectResult(r)}
                      className="hover:bg-white/5 active:bg-white/10 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 text-zinc-400 text-[11px]">{dateStr}</td>
                      <td className="py-3 px-3 font-bold text-white font-sans text-xs">
                        {r.athleteName}
                      </td>
                      <td className="py-3 px-3 text-zinc-300 text-[11px]">
                        {r.eventName}
                      </td>
                      <td className="py-3 px-3 font-black text-[#ccff00] text-sm">
                        {timeSec}s
                      </td>
                      <td className="py-3 px-3">
                        <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 text-[9px] font-mono text-emerald-400">
                          ±{r.uncertaintyMs}ms
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#ccff00]">
                          Review <ChevronRight className="h-3 w-3" />
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
