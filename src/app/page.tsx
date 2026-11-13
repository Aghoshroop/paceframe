"use client";

import React, { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { DashboardView } from "@/components/DashboardView";
import { CameraStudioView } from "@/components/CameraStudioView";
import { LiveConsoleView } from "@/components/LiveConsoleView";
import { GateCameraView } from "@/components/GateCameraView";
import { ResultsView } from "@/components/ResultsView";
import { HistoryView } from "@/components/HistoryView";
import { PairingModal } from "@/components/PairingModal";
import { GateQRModal } from "@/components/GateQRModal";
import { QRScannerModal } from "@/components/QRScannerModal";
import { SessionConfigModal } from "@/components/SessionConfigModal";
import {
  Session,
  Athlete,
  DetectionZone,
  TimingResult,
  TimingEvent,
  DeviceRole,
  ConnectedDevice,
  SyncQuality,
  ConnectionStatus,
} from "@/types";
import { TimingEngine } from "@/lib/timing/timingEngine";
import { MeshNetworkManager } from "@/lib/network/meshNetwork";
import { StorageDB } from "@/lib/storage/db";
import { getPreciseTime } from "@/lib/timing/clockSync";

export default function PaceFrameApp() {
  // Navigation View State - default to live_console for instant readiness
  const [currentView, setCurrentView] = useState<
    "dashboard" | "camera_studio" | "live_console" | "results" | "history" | "gate_camera"
  >("live_console");

  // Device & Session Identifiers
  const [sessionId, setSessionId] = useState<string>("PACE-101");
  const [deviceId, setDeviceId] = useState<string>("");
  const [deviceName, setDeviceName] = useState<string>("PACE Device");
  const [deviceRole, setDeviceRole] = useState<DeviceRole>("master_console");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("ready");
  const [syncQuality, setSyncQuality] = useState<SyncQuality>({
    rttMs: 0,
    clockOffsetMs: 0,
    jitterMs: 0.8,
    samplesCount: 5,
    quality: "excellent",
  });

  // Athletes and Sessions Database
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [recentResults, setRecentResults] = useState<TimingResult[]>([]);
  const [activeResult, setActiveResult] = useState<TimingResult | null>(null);

  // Modals State
  const [isPairingOpen, setIsPairingOpen] = useState<boolean>(false);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isGateQROpen, setIsGateQROpen] = useState<boolean>(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState<boolean>(false);
  const [gateModalRole, setGateModalRole] = useState<DeviceRole>("finish_camera");
  const [resetKey, setResetKey] = useState<number>(0);

  // Active Detection Zones (Line 1, Line 2...)
  const [zones, setZones] = useState<DetectionZone[]>([]);

  // Connected Devices List
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);

  // Core Engine References
  const timingEngineRef = useRef<TimingEngine | null>(null);
  const meshNetworkRef = useRef<MeshNetworkManager | null>(null);

  // Active Session Model
  const [session, setSession] = useState<Session>({
    sessionId: "PACE-101",
    sessionName: "Flying 30m Sprint Profiling",
    athleteId: "ath_lyles",
    athleteName: "Marcus Vance",
    eventName: "Flying 30m Velocity",
    distanceMeters: 30,
    isFlyingStart: true,
    flyingDistanceMeters: 30,
    startMethod: "hold_and_release",
    sessionStatus: "idle",
    targetLaps: 0,
    zones: [],
    devices: [],
    createdAt: 0,
  });

  // Initialize App on Mount
  useEffect(() => {
    // 1. Load athletes and past results
    const loadedAthletes = StorageDB.getAthletes();
    const loadedResults = StorageDB.getResults();
    setAthletes(loadedAthletes);
    setRecentResults(loadedResults);
    if (loadedResults.length > 0) {
      setActiveResult(loadedResults[0]);
    }

    // 2. Generate or load device ID and name
    const storedDeviceId =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("paceframe_dev_id") ||
          `dev_${Math.random().toString(36).substring(2, 9)}`
        : `dev_${Math.random().toString(36).substring(2, 9)}`;

    if (typeof localStorage !== "undefined") {
      localStorage.setItem("paceframe_dev_id", storedDeviceId);
    }
    setDeviceId(storedDeviceId);

    // Device friendly name
    const isMobile =
      typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const friendlyName = isMobile ? "Trackside Mobile" : "Coach Workstation";
    setDeviceName(friendlyName);

    // 3. Check URL query params for ?session=XYZ and ?role=finish_camera
    let targetSession = "PACE-101";
    let initialRole: DeviceRole = "master_console";
    let initialView: "dashboard" | "camera_studio" | "live_console" | "results" | "history" | "gate_camera" = "live_console";

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlSession = params.get("session");
      if (urlSession) {
        targetSession = urlSession.toUpperCase();
      }
      const urlRole = params.get("role") as DeviceRole | null;
      if (urlRole) {
        initialRole = urlRole;
        if (
          urlRole === "finish_camera" ||
          urlRole === "start_camera" ||
          urlRole === "split_camera" ||
          urlRole === "lap_camera" ||
          urlRole === "secondary_camera"
        ) {
          initialView = "gate_camera";
        }
      }
    }
    setSessionId(targetSession);
    setDeviceRole(initialRole);
    setCurrentView(initialView);

    // 4. Default Detection Zones
    const defaultZones: DetectionZone[] = [
      {
        zoneId: "zone_finish_main",
        deviceId: storedDeviceId,
        zoneType: "finish",
        name: "Finish Line",
        lineCoordinates: { x1: 0.5, y1: 0.05, x2: 0.5, y2: 0.95 },
        detectionDirection: "bidirectional",
        confidenceThreshold: 0.6,
        cooldownMs: 1500,
        color: "#ccff00",
        active: true,
      },
      {
        zoneId: "zone_split_intermediate",
        deviceId: storedDeviceId,
        zoneType: "split",
        name: "Intermediate Split",
        lineCoordinates: { x1: 0.25, y1: 0.05, x2: 0.25, y2: 0.95 },
        detectionDirection: "bidirectional",
        confidenceThreshold: 0.6,
        cooldownMs: 1500,
        color: "#00f0ff",
        active: false,
      },
    ];
    setZones(defaultZones);

    const initialSession: Session = {
      sessionId: targetSession,
      sessionName: "Flying 30m Sprint Profiling",
      athleteId: loadedAthletes[0]?.athleteId || "ath_lyles",
      athleteName: loadedAthletes[0]?.name || "Marcus Vance",
      eventName: "Flying 30m Velocity",
      distanceMeters: 30,
      isFlyingStart: true,
      flyingDistanceMeters: 30,
      startMethod: "hold_and_release",
      sessionStatus: "idle",
      targetLaps: 0,
      zones: defaultZones,
      devices: [],
      createdAt: Date.now(),
    };
    setSession(initialSession);

    // 5. Initialize Authoritative Timing Engine
    const engine = new TimingEngine(initialSession);
    timingEngineRef.current = engine;

    engine.subscribe({
      onResultGenerated: (res) => {
        const updated = StorageDB.saveResult(res);
        setRecentResults(updated);
        setActiveResult(res);
        // Keep coach in Live Console so they see the stopped timer and photo-finish freeze frame
      },
    });

    // 6. Initialize Multi-Device Mesh Network
    const isAuthority = initialRole === "master_console";
    const mesh = new MeshNetworkManager(
      targetSession,
      storedDeviceId,
      friendlyName,
      initialRole,
      isAuthority
    );
    meshNetworkRef.current = mesh;

    mesh.init({
      onDeviceListUpdate: (devs) => {
        setConnectedDevices(devs);
      },
      onTimingEventReceived: (event) => {
        // Feed remote event into timing engine
        engine.processEvent(event, mesh.getClockSync().getQuality());
      },
      onRoleAssigned: (newRole) => {
        setDeviceRole(newRole);
        if (
          newRole === "finish_camera" ||
          newRole === "start_camera" ||
          newRole === "split_camera" ||
          newRole === "lap_camera"
        ) {
          setCurrentView("gate_camera");
        } else if (newRole === "master_console") {
          setCurrentView("live_console");
        }
      },
      onSyncQualityUpdate: (quality) => {
        setSyncQuality(quality);
      },
      onConnectionStatusChange: (status) => {
        setConnectionStatus(status);
      },
      onManualTriggerReceived: (trigger) => {
        if (trigger.type === "ARM") {
          engine.arm();
        } else if (trigger.type === "START") {
          engine.manualOverride("START", trigger.timestamp);
        } else if (trigger.type === "STOP") {
          engine.manualOverride("FINISH", trigger.timestamp);
        }
      },
      onSessionReset: () => {
        setResetKey((k) => k + 1);
        engine.reset();
        setActiveResult(null);
      },
    });

    return () => {
      mesh.destroy();
    };
  }, []);

  // Handle local camera timing crossing event
  const handleTimingEventDetected = (event: TimingEvent) => {
    // 1. Process locally in timing engine
    if (timingEngineRef.current) {
      timingEngineRef.current.processEvent(
        event,
        syncQuality,
        {
          cameraFps: 60,
          processingFps: 60,
          droppedFrames: 0,
          frameLatencyMs: 16.6,
          resolution: { width: 1280, height: 720 },
        }
      );
    }

    // 2. Broadcast to all connected devices in mesh
    if (meshNetworkRef.current) {
      meshNetworkRef.current.emitTimingEvent(event);
    }
  };

  // Handle manual trigger (Hold & Release or manual override)
  const handleManualTrigger = (type: "ARM" | "START" | "STOP") => {
    if (meshNetworkRef.current) {
      meshNetworkRef.current.emitManualTrigger(type);
    }
  };

  // Handle device role change
  const handleRoleChange = (newRole: DeviceRole) => {
    setDeviceRole(newRole);
    if (meshNetworkRef.current) {
      meshNetworkRef.current.setRole(newRole);
    }
  };

  // Handle remote role assignment
  const handleAssignRemoteRole = (targetDeviceId: string, newRole: DeviceRole) => {
    if (meshNetworkRef.current) {
      meshNetworkRef.current.assignRemoteDeviceRole(targetDeviceId, newRole);
    }
  };

  // Join a new session ID
  const handleJoinSession = (newSessionId: string, roleToJoin: DeviceRole = deviceRole) => {
    const cleanSessionId = newSessionId.trim().toUpperCase();
    setSessionId(cleanSessionId);
    setDeviceRole(roleToJoin);
    const updated = { ...session, sessionId: cleanSessionId };
    setSession(updated);

    if (timingEngineRef.current) {
      timingEngineRef.current.updateSession(updated);
      timingEngineRef.current.reset();
    }

    if (meshNetworkRef.current) {
      meshNetworkRef.current.destroy();
      const isAuthority = roleToJoin === "master_console";
      const mesh = new MeshNetworkManager(
        cleanSessionId,
        deviceId,
        deviceName,
        roleToJoin,
        isAuthority
      );
      meshNetworkRef.current = mesh;
      mesh.init({
        onDeviceListUpdate: (devs) => setConnectedDevices(devs),
        onTimingEventReceived: (event) =>
          timingEngineRef.current?.processEvent(event, mesh.getClockSync().getQuality()),
        onRoleAssigned: (role) => {
          setDeviceRole(role);
          if (
            role === "finish_camera" ||
            role === "start_camera" ||
            role === "split_camera" ||
            role === "lap_camera"
          ) {
            setCurrentView("gate_camera");
          }
        },
        onSyncQualityUpdate: (quality) => setSyncQuality(quality),
        onConnectionStatusChange: (s) => setConnectionStatus(s),
        onManualTriggerReceived: (trigger) => {
          if (trigger.type === "ARM") {
            timingEngineRef.current?.arm();
          } else if (trigger.type === "START") {
            timingEngineRef.current?.manualOverride("START", trigger.timestamp);
          } else if (trigger.type === "STOP") {
            timingEngineRef.current?.manualOverride("FINISH", trigger.timestamp);
          }
        },
        onSessionReset: () => {
          setResetKey((k) => k + 1);
          timingEngineRef.current?.reset();
          setActiveResult(null);
        },
      });
    }
  };

  // Broadcast session reset to all gates
  const handleResetSession = () => {
    timingEngineRef.current?.reset();
    setActiveResult(null);
    setResetKey((k) => k + 1);
    if (meshNetworkRef.current) {
      meshNetworkRef.current.broadcastResetSession();
    }
  };

  // Handle scan success from in-app QR scanner
  const handleScanSuccess = (scannedSessionId: string, scannedRole?: string) => {
    setIsQRScannerOpen(false);
    const targetRole: DeviceRole = (scannedRole as DeviceRole) || "finish_camera";
    handleJoinSession(scannedSessionId, targetRole);

    if (
      targetRole === "finish_camera" ||
      targetRole === "start_camera" ||
      targetRole === "split_camera" ||
      targetRole === "lap_camera" ||
      targetRole === "secondary_camera"
    ) {
      setCurrentView("gate_camera");
    } else {
      setCurrentView("live_console");
    }
  };

  // Clock sync trigger
  const handleTriggerClockSync = () => {
    if (meshNetworkRef.current) {
      meshNetworkRef.current.broadcastMessage("CLOCK_PING", { t1: getPreciseTime() });
    }
  };

  // Update session settings
  const handleSaveSessionConfig = (updates: Partial<Session>) => {
    const updated = { ...session, ...updates };
    setSession(updated);
    if (timingEngineRef.current) {
      timingEngineRef.current.updateSession(updated);
    }
    StorageDB.saveSession(updated);
  };

  // Add new athlete
  const handleAddNewAthlete = (name: string, team?: string): Athlete => {
    const newAthlete: Athlete = {
      athleteId: `ath_${Date.now()}`,
      name,
      teamId: team || "Independent",
      bibNumber: (Math.floor(Math.random() * 800) + 100).toString(),
      category: "Senior",
    };
    const updatedList = StorageDB.saveAthlete(newAthlete);
    setAthletes(updatedList);
    return newAthlete;
  };

  // Update detection zones
  const handleUpdateZones = (newZones: DetectionZone[]) => {
    setZones(newZones);
    const updatedSession = { ...session, zones: newZones };
    setSession(updatedSession);
    if (timingEngineRef.current) {
      timingEngineRef.current.updateSession(updatedSession);
    }
  };

  return (
    <div className="flex h-full min-h-[100dvh] max-h-[100dvh] w-full flex-col bg-[#0a0c0f] text-[#f3f4f6] overflow-hidden select-none">
      {/* Top Professional Status Header */}
      <Header
        currentView={currentView}
        onSelectView={(view) => {
          setCurrentView(view);
          if (view === "live_console" && deviceRole !== "master_console") {
            handleRoleChange("master_console");
          } else if (view === "gate_camera" && deviceRole === "master_console") {
            handleRoleChange("finish_camera");
          }
        }}
        sessionId={sessionId}
        deviceRole={deviceRole}
        onRoleChange={(newRole) => {
          handleRoleChange(newRole);
          if (
            newRole === "finish_camera" ||
            newRole === "start_camera" ||
            newRole === "split_camera" ||
            newRole === "lap_camera"
          ) {
            setCurrentView("gate_camera");
          } else if (newRole === "master_console") {
            setCurrentView("live_console");
          }
        }}
        syncQuality={syncQuality}
        connectionStatus={connectionStatus}
        connectedDevicesCount={connectedDevices.length}
        onOpenScanner={() => setIsQRScannerOpen(true)}
        onOpenGateQR={() => {
          setGateModalRole("finish_camera");
          setIsGateQROpen(true);
        }}
      />

      {/* Main Responsive Screen Viewport */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {currentView === "dashboard" && (
          <DashboardView
            currentSession={session}
            recentResults={recentResults}
            athletes={athletes}
            deviceRole={deviceRole}
            syncQuality={syncQuality}
            connectedDevicesCount={connectedDevices.length}
            onOpenSessionConfig={() => setIsConfigOpen(true)}
            onOpenPairing={() => setIsPairingOpen(true)}
            onOpenStudio={() => setCurrentView("camera_studio")}
            onOpenConsole={() => setCurrentView("live_console")}
            onOpenHistory={() => setCurrentView("history")}
            onSelectResult={(res) => {
              setActiveResult(res);
              setCurrentView("results");
            }}
          />
        )}

        {currentView === "camera_studio" && (
          <CameraStudioView
            zones={zones}
            onUpdateZones={handleUpdateZones}
            deviceRole={deviceRole}
            sessionId={sessionId}
            deviceId={deviceId}
            deviceName={deviceName}
            clockOffsetMs={syncQuality.clockOffsetMs}
            onTimingEventDetected={handleTimingEventDetected}
            onOpenLiveConsole={() => setCurrentView("live_console")}
          />
        )}

        {currentView === "live_console" && timingEngineRef.current && (
          <LiveConsoleView
            session={session}
            timingEngine={timingEngineRef.current}
            connectedDevices={connectedDevices}
            zones={zones}
            deviceId={deviceId}
            onOpenResults={(res) => {
              setActiveResult(res);
              setCurrentView("results");
            }}
            onOpenGateQR={(role) => {
              setGateModalRole(role);
              setIsGateQROpen(true);
            }}
            onManualTrigger={handleManualTrigger}
            onAssignDeviceRole={handleAssignRemoteRole}
            onResetSession={handleResetSession}
          />
        )}

        {currentView === "gate_camera" && (
          <GateCameraView
            deviceRole={deviceRole}
            sessionId={sessionId}
            deviceId={deviceId}
            deviceName={deviceName}
            clockOffsetMs={syncQuality.clockOffsetMs}
            zones={zones}
            resetKey={resetKey}
            onUpdateZones={handleUpdateZones}
            onTimingEventDetected={handleTimingEventDetected}
            onSwitchToConsole={() => {
              handleRoleChange("master_console");
              setCurrentView("live_console");
            }}
          />
        )}

        {currentView === "results" && (
          <ResultsView
            result={activeResult}
            onBackToConsole={() => setCurrentView("live_console")}
            onNewAttempt={() => {
              handleResetSession();
              setCurrentView("live_console");
            }}
          />
        )}

        {currentView === "history" && (
          <HistoryView
            athletes={athletes}
            onInspectResult={(res) => {
              setActiveResult(res);
              setCurrentView("results");
            }}
          />
        )}
      </main>

      {/* Role-Specific Gate QR Modal */}
      <GateQRModal
        isOpen={isGateQROpen}
        onClose={() => setIsGateQROpen(false)}
        sessionId={sessionId}
        connectedDevices={connectedDevices}
        initialRole={gateModalRole}
      />

      {/* In-App Camera QR Scanner Modal */}
      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Device Pairing Modal (General) */}
      <PairingModal
        isOpen={isPairingOpen}
        onClose={() => setIsPairingOpen(false)}
        sessionId={sessionId}
        connectedDevices={connectedDevices}
        onAssignRole={handleAssignRemoteRole}
        onJoinSession={handleJoinSession}
        onTriggerClockSync={handleTriggerClockSync}
      />

      {/* Session Configuration Modal */}
      <SessionConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        athletes={athletes}
        currentSession={session}
        onSaveSession={handleSaveSessionConfig}
        onAddNewAthlete={handleAddNewAthlete}
      />
    </div>
  );
}
