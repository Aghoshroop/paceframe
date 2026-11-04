"use client";

import React, { useState } from "react";
import {
  X,
  Settings,
  User,
  Zap,
  Target,
  Flag,
  RotateCw,
  Plus,
  Gauge,
  Sliders,
} from "lucide-react";
import { Session, Athlete, StartMethod } from "@/types";

interface SessionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  athletes: Athlete[];
  currentSession: Session;
  onSaveSession: (updatedSession: Partial<Session>) => void;
  onAddNewAthlete: (name: string, team?: string) => Athlete;
}

export const SessionConfigModal: React.FC<SessionConfigModalProps> = ({
  isOpen,
  onClose,
  athletes,
  currentSession,
  onSaveSession,
  onAddNewAthlete,
}) => {
  const [sessionName, setSessionName] = useState(currentSession.sessionName);
  const [selectedAthleteId, setSelectedAthleteId] = useState(currentSession.athleteId);
  const [eventName, setEventName] = useState(currentSession.eventName);
  const [distanceMeters, setDistanceMeters] = useState<string>(
    currentSession.distanceMeters ? currentSession.distanceMeters.toString() : "30"
  );
  const [isDistanceIndependent, setIsDistanceIndependent] = useState<boolean>(
    !currentSession.distanceMeters
  );
  const [isFlyingStart, setIsFlyingStart] = useState<boolean>(currentSession.isFlyingStart);
  const [startMethod, setStartMethod] = useState<StartMethod>(currentSession.startMethod);
  const [targetLaps, setTargetLaps] = useState<number>(currentSession.targetLaps || 0);

  // New athlete quick creator
  const [showNewAthlete, setShowNewAthlete] = useState(false);
  const [newAthleteName, setNewAthleteName] = useState("");
  const [newAthleteTeam, setNewAthleteTeam] = useState("");

  if (!isOpen) return null;

  const handleCreateAthlete = (e: React.FormEvent) => {
    e.preventDefault();
    if (newAthleteName.trim()) {
      const created = onAddNewAthlete(newAthleteName.trim(), newAthleteTeam.trim());
      setSelectedAthleteId(created.athleteId);
      setShowNewAthlete(false);
      setNewAthleteName("");
      setNewAthleteTeam("");
    }
  };

  const handleSave = () => {
    const athlete = athletes.find((a) => a.athleteId === selectedAthleteId);
    onSaveSession({
      sessionName,
      athleteId: selectedAthleteId,
      athleteName: athlete ? athlete.name : "Athletic Performer",
      eventName,
      distanceMeters: isDistanceIndependent ? undefined : parseFloat(distanceMeters) || undefined,
      isFlyingStart,
      startMethod,
      targetLaps,
    });
    onClose();
  };

  const QUICK_EVENTS = [
    { label: "Flying 10m", dist: "10", flying: true },
    { label: "Flying 20m", dist: "20", flying: true },
    { label: "Flying 30m", dist: "30", flying: true },
    { label: "10m Accel", dist: "10", flying: false },
    { label: "30m Block", dist: "30", flying: false },
    { label: "60m Sprint", dist: "60", flying: false },
    { label: "100m Dash", dist: "100", flying: false },
    { label: "Zone Only (No Dist)", dist: "", flying: false, zoneOnly: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#0f1217] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-[#ccff00]/10 p-2 text-[#ccff00]">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                TIMING SESSION CONFIGURATION
              </h2>
              <p className="text-xs text-zinc-400">
                Configure distance, start trigger, athlete, and virtual timing zone rules
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

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Athlete Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[#ccff00]" />
                Target Athlete
              </label>
              <button
                type="button"
                onClick={() => setShowNewAthlete(!showNewAthlete)}
                className="text-[11px] font-semibold text-[#ccff00] hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                {showNewAthlete ? "Cancel" : "Add Athlete"}
              </button>
            </div>

            {showNewAthlete ? (
              <div className="rounded-xl border border-white/10 bg-zinc-900/90 p-3 space-y-2 mb-3">
                <input
                  type="text"
                  placeholder="Athlete Full Name (e.g. Marcus Vance)"
                  value={newAthleteName}
                  onChange={(e) => setNewAthleteName(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-[#ccff00] focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Club / Academy (e.g. Apex Track Club)"
                  value={newAthleteTeam}
                  onChange={(e) => setNewAthleteTeam(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-[#ccff00] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreateAthlete}
                  className="w-full rounded-lg bg-[#ccff00] py-2 text-xs font-bold text-black"
                >
                  Create & Select Athlete
                </button>
              </div>
            ) : null}

            <select
              value={selectedAthleteId}
              onChange={(e) => setSelectedAthleteId(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white focus:border-[#ccff00] focus:outline-none"
            >
              {athletes.map((a) => (
                <option key={a.athleteId} value={a.athleteId}>
                  {a.name} {a.teamId ? `(${a.teamId})` : ""} {a.pb100m ? `— PB: ${a.pb100m}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Event Presets */}
          <div>
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block mb-2">
              Quick Event Presets (Unrestricted Distance)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {QUICK_EVENTS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setEventName(preset.label);
                    if (preset.zoneOnly) {
                      setIsDistanceIndependent(true);
                      setDistanceMeters("");
                    } else {
                      setIsDistanceIndependent(false);
                      setDistanceMeters(preset.dist);
                    }
                    setIsFlyingStart(preset.flying);
                  }}
                  className={`rounded-xl border p-2.5 text-xs text-center font-semibold transition-all ${
                    eventName === preset.label
                      ? "border-[#ccff00] bg-[#ccff00]/15 text-[#ccff00]"
                      : "border-white/10 bg-zinc-950 text-zinc-300 hover:border-white/20"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Event & Distance Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block mb-1.5">
                Event Description
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Flying 30m Max Velocity"
                className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-2.5 text-xs text-white focus:border-[#ccff00] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                  Distance (Meters)
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDistanceIndependent}
                    onChange={(e) => setIsDistanceIndependent(e.target.checked)}
                    className="accent-[#ccff00] rounded"
                  />
                  Zone Only
                </label>
              </div>
              <input
                type="number"
                disabled={isDistanceIndependent}
                value={distanceMeters}
                onChange={(e) => setDistanceMeters(e.target.value)}
                placeholder={isDistanceIndependent ? "Distance Independent" : "e.g. 30"}
                className={`w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-2.5 text-xs text-white focus:border-[#ccff00] focus:outline-none ${
                  isDistanceIndependent ? "opacity-40 cursor-not-allowed" : ""
                }`}
              />
            </div>
          </div>

          {/* Start Trigger Method Selection */}
          <div>
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block mb-2">
              Start Trigger Method
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStartMethod("hold_and_release")}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  startMethod === "hold_and_release"
                    ? "border-[#ccff00] bg-[#ccff00]/10 text-white shadow-[0_0_15px_rgba(204,255,0,0.08)]"
                    : "border-white/10 bg-zinc-950 text-zinc-400 hover:border-white/20"
                }`}
              >
                <div
                  className={`mt-0.5 rounded-lg p-2 ${
                    startMethod === "hold_and_release"
                      ? "bg-[#ccff00] text-black"
                      : "bg-zinc-900 text-zinc-400"
                  }`}
                >
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Hold & Release (Manual)</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    Coach presses & holds START. Releasing triggers synchronized zero-latency acoustic gun start.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStartMethod("camera_automatic")}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  startMethod === "camera_automatic"
                    ? "border-[#ccff00] bg-[#ccff00]/10 text-white shadow-[0_0_15px_rgba(204,255,0,0.08)]"
                    : "border-white/10 bg-zinc-950 text-zinc-400 hover:border-white/20"
                }`}
              >
                <div
                  className={`mt-0.5 rounded-lg p-2 ${
                    startMethod === "camera_automatic"
                      ? "bg-[#ccff00] text-black"
                      : "bg-zinc-900 text-zinc-400"
                  }`}
                >
                  <Target className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Camera Automatic Start</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    Camera tracks runner torso. Clock starts automatically when athlete crosses start line (supports flying starts!).
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Laps or Sprint */}
          <div>
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block mb-2">
              Lap Mode & Repeated Crossings
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTargetLaps(0)}
                className={`flex-1 rounded-xl border p-3 text-center text-xs font-semibold transition-all ${
                  targetLaps === 0
                    ? "border-[#ccff00] bg-[#ccff00]/15 text-[#ccff00]"
                    : "border-white/10 bg-zinc-950 text-zinc-400"
                }`}
              >
                Single Sprint (1 Crossing = Finish)
              </button>
              <button
                type="button"
                onClick={() => setTargetLaps(targetLaps > 0 ? targetLaps : 2)}
                className={`flex-1 rounded-xl border p-3 text-center text-xs font-semibold transition-all ${
                  targetLaps > 0
                    ? "border-[#ccff00] bg-[#ccff00]/15 text-[#ccff00]"
                    : "border-white/10 bg-zinc-950 text-zinc-400"
                }`}
              >
                Multi-Lap Circular Track ({targetLaps > 0 ? `${targetLaps} Laps` : "Set Laps"})
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-6 py-4 bg-zinc-950 flex items-center justify-between">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-xl bg-[#ccff00] px-6 py-2.5 text-xs font-bold text-black shadow-lg hover:bg-[#b8e600] transition-colors"
          >
            Save & Update Session
          </button>
        </div>
      </div>
    </div>
  );
};

