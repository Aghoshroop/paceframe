// Offline-First Athlete, Session, and Results Persistence with CSV Export

import { Athlete, Session, TimingResult } from "@/types";

const ATHLETES_KEY = "paceframe_athletes_v1";
const SESSIONS_KEY = "paceframe_sessions_v1";
const RESULTS_KEY = "paceframe_results_v1";

// Seed default academy athletes
const DEFAULT_ATHLETES: Athlete[] = [
  {
    athleteId: "ath_lyles",
    name: "Marcus Vance",
    teamId: "Apex Sprint Academy",
    bibNumber: "101",
    category: "Senior Men",
    pb100m: "9.94s",
    notes: "Specializes in 60m acceleration and flying 30m top-end speed.",
  },
  {
    athleteId: "ath_richardson",
    name: "Elena Rostova",
    teamId: "National Performance Center",
    bibNumber: "204",
    category: "Senior Women",
    pb100m: "10.72s",
    notes: "High knee-drive mechanics, exceptional drive phase.",
  },
  {
    athleteId: "ath_coleman",
    name: "Kofi Mensah",
    teamId: "Metro Track Club",
    bibNumber: "318",
    category: "U20 Men",
    pb100m: "10.18s",
    notes: "Focus on fly-in transition and posture maintenance.",
  },
  {
    athleteId: "ath_alvarez",
    name: "Sofia Alvarez",
    teamId: "High Altitude Academy",
    bibNumber: "412",
    category: "U18 Women",
    pb100m: "11.45s",
    notes: "Developing 10m-30m transition mechanics.",
  },
];

export class StorageDB {
  // --- Athletes ---
  public static getAthletes(): Athlete[] {
    if (typeof window === "undefined") return DEFAULT_ATHLETES;
    try {
      const data = localStorage.getItem(ATHLETES_KEY);
      if (!data) {
        localStorage.setItem(ATHLETES_KEY, JSON.stringify(DEFAULT_ATHLETES));
        return DEFAULT_ATHLETES;
      }
      return JSON.parse(data);
    } catch {
      return DEFAULT_ATHLETES;
    }
  }

  public static saveAthlete(athlete: Athlete): Athlete[] {
    const list = this.getAthletes();
    const idx = list.findIndex((a) => a.athleteId === athlete.athleteId);
    if (idx >= 0) {
      list[idx] = athlete;
    } else {
      list.unshift(athlete);
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(ATHLETES_KEY, JSON.stringify(list));
    }
    return list;
  }

  // --- Sessions ---
  public static getSessions(): Session[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(SESSIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public static saveSession(session: Session) {
    const list = this.getSessions();
    const idx = list.findIndex((s) => s.sessionId === session.sessionId);
    if (idx >= 0) {
      list[idx] = session;
    } else {
      list.unshift(session);
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
    }
  }

  public static getSessionById(sessionId: string): Session | null {
    const list = this.getSessions();
    return list.find((s) => s.sessionId === sessionId) || null;
  }

  // --- Results ---
  public static getResults(): TimingResult[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(RESULTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public static saveResult(result: TimingResult): TimingResult[] {
    const list = this.getResults();
    list.unshift(result);
    // Keep max 100 historical results in local storage
    if (list.length > 100) list.pop();
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(RESULTS_KEY, JSON.stringify(list));
      } catch (e) {
        // Handle storage quota if photo-finish frames are large
        const lightweightList = list.map((r) => ({
          ...r,
          videoEvidence: undefined, // strip video to save space
        }));
        localStorage.setItem(RESULTS_KEY, JSON.stringify(lightweightList));
      }
    }
    return list;
  }

  public static getResultById(resultId: string): TimingResult | null {
    const list = this.getResults();
    return list.find((r) => r.resultId === resultId) || null;
  }

  // --- CSV Export ---
  public static exportResultsToCSV(results: TimingResult[]) {
    if (results.length === 0) return;

    const headers = [
      "Result ID",
      "Date",
      "Athlete",
      "Event",
      "Distance (m)",
      "Start Method",
      "Total Time (s)",
      "Avg Speed (km/h)",
      "Splits Count",
      "Split 1 (s)",
      "Split 2 (s)",
      "Split 3 (s)",
      "Timing Quality",
      "Uncertainty (ms)",
      "Clock Sync Jitter (ms)",
      "Camera FPS",
    ];

    const rows = results.map((r) => {
      const dateStr = new Date(r.recordedAt).toISOString().split("T")[0];
      const totalSec = (r.totalTimeMs / 1000).toFixed(3);
      const avgSpeed =
        r.distanceMeters && r.totalTimeMs > 0
          ? ((r.distanceMeters / (r.totalTimeMs / 1000)) * 3.6).toFixed(2)
          : "N/A";

      const s1 = r.splitTimes[0] ? (r.splitTimes[0].splitTimeMs / 1000).toFixed(3) : "";
      const s2 = r.splitTimes[1] ? (r.splitTimes[1].splitTimeMs / 1000).toFixed(3) : "";
      const s3 = r.splitTimes[2] ? (r.splitTimes[2].splitTimeMs / 1000).toFixed(3) : "";

      return [
        `"${r.resultId}"`,
        `"${dateStr}"`,
        `"${r.athleteName}"`,
        `"${r.eventName}"`,
        r.distanceMeters ?? "",
        `"${r.startMethod}"`,
        totalSec,
        avgSpeed,
        r.splitTimes.length,
        s1,
        s2,
        s3,
        `"${r.timingQuality}"`,
        r.uncertaintyMs,
        r.syncQuality.jitterMs,
        r.hardwareMetrics.cameraFps,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `PACEFRAME_Sprint_Results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

