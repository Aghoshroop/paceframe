"use client";

import React, { useState } from "react";
import {
  X,
  Settings,
  User,
  Zap,
  Target,
  Plus,
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
    { label: "30m Accel", dist: "30", flying: false },
    { label: "60m Dash", dist: "60", flying: false },
    { label: "100m Dash", dist: "100", flying: false },
    { label: "Zone Only", dist: "", flying: false, zoneOnly: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4">
      <div className="w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#0f1217] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-[#ccff00]/10 p-1.5 sm:p-2 text-[#ccff00]">
              <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                SESSION SETTINGS
              </h2>
              <p className="text-[10px] sm:text-xs text-zinc-400">
                Configure distance, start trigger, athlete, and gates
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

        {/* Form Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4">
          {/* Athlete Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <User className="h-3 w-3 text-[#ccff00]" />
                Athlete
              </label>
              <button
                type="button"
                onClick={() => setShowNewAthlete(!showNewAthlete)}
                className="text-[10px] font-semibold text-[#ccff00] hover:underline flex items-center gap-0.5"
              >
                <Plus className="h-3 w-3" />
                {showNewAthlete ? "Cancel" : "Add Athlete"}
              </button>
            </div>

            {showNewAthlete ? (
              <div className="rounded-xl border border-white/10 bg-zinc-900/90 p-2.5 space-y-2 mb-2">
                <input
                  type="text"
                  placeholder="Athlete Full Name (e.g. Marcus Vance)"
                  value={newAthleteName}
                  onChange={(e) => setNewAthleteName(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-zinc-950 px-3 py-1.5 text-xs text-white focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Academy (e.g. Apex Track Club)"
                  value={newAthleteTeam}
                  onChange={(e) => setNewAthleteTeam(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-zinc-950 px-3 py-1.5 text-xs text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreateAthlete}
                  className="w-full rounded-lg bg-[#ccff00] py-1.5 text-xs font-bold text-black"
                >
                  Save Athlete
                </button>
              </div>
            ) : null}

            <select
              value={selectedAthleteId}
              onChange={(e) => setSelectedAthleteId(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-3 py-2 text-xs font-semibold text-white focus:outline-none"
            >
              {athletes.map((a) => (
                <option key={a.athleteId} value={a.athleteId}>
                  {a.name} {a.pb100m ? `— PB: ${a.pb100m}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Presets */}
          <div>
            <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1.5">
              Quick Event Presets
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
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
                  className={`rounded-xl border p-2 text-[10px] text-center font-semibold transition-all active:scale-95 ${
                    eventName === preset.label
                      ? "border-[#ccff00] bg-[#ccff00]/15 text-[#ccff00]"
                      : "border-white/10 bg-zinc-950 text-zinc-300"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Event & Distance Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                Event Description
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Flying 30m"
                className="w-full rounded-xl border border-white/15 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  Distance (Meters)
                </label>
                <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
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
                placeholder={isDistanceIndependent ? "Distance Free" : "e.g. 30"}
                className={`w-full rounded-xl border border-white/15 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none ${
                  isDistanceIndependent ? "opacity-40 cursor-not-allowed" : ""
                }`}
              />
            </div>
          </div>

          {/* Start Method */}
          <div>
            <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1.5">
              Start Trigger Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStartMethod("hold_and_release")}
                className={`flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-all active:scale-98 ${
                  startMethod === "hold_and_release"
                    ? "border-[#ccff00] bg-[#ccff00]/10 text-white"
                    : "border-white/10 bg-zinc-950 text-zinc-400"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                  <Zap className="h-3.5 w-3.5 text-[#ccff00]" />
                  Hold & Release
                </div>
                <div className="text-[10px] text-zinc-400 leading-tight">
                  Coach presses and releases START thumb button.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStartMethod("camera_automatic")}
                className={`flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-all active:scale-98 ${
                  startMethod === "camera_automatic"
                    ? "border-[#ccff00] bg-[#ccff00]/10 text-white"
                    : "border-white/10 bg-zinc-950 text-zinc-400"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                  <Target className="h-3.5 w-3.5 text-[#ccff00]" />
                  Camera Auto
                </div>
                <div className="text-[10px] text-zinc-400 leading-tight">
                  Start line optical detection for flying starts.
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-4 py-3 bg-zinc-950 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs font-semibold text-zinc-400 hover:text-white px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-xl bg-[#ccff00] px-5 py-2 text-xs font-bold text-black shadow-lg hover:bg-[#b8e600] active:scale-95"
          >
            Save Session
          </button>
        </div>
      </div>
    </div>
  );
};
