// Real-Time Multi-Device Mesh Network with Dual-Transport (BroadcastChannel + WebRTC/Relay)

import {
  ConnectedDevice,
  DeviceRole,
  ConnectionStatus,
  NetworkMessage,
  TimingEvent,
  SyncQuality,
} from "@/types";
import { ClockSyncManager } from "@/lib/timing/clockSync";

export interface MeshNetworkCallbacks {
  onDeviceListUpdate?: (devices: ConnectedDevice[]) => void;
  onTimingEventReceived?: (event: TimingEvent) => void;
  onRoleAssigned?: (newRole: DeviceRole) => void;
  onSyncQualityUpdate?: (quality: SyncQuality) => void;
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  onManualTriggerReceived?: (trigger: { type: "ARM" | "START" | "STOP"; timestamp: number }) => void;
}

export class MeshNetworkManager {
  private sessionId: string;
  private myDeviceId: string;
  private myDeviceName: string;
  private myRole: DeviceRole;
  private isAuthority: boolean;
  private connectionStatus: ConnectionStatus = "disconnected";

  private clockSync: ClockSyncManager;
  private broadcastChannel: BroadcastChannel | null = null;
  private pollIntervalId: any = null;
  private heartbeatIntervalId: any = null;
  private clockPingIntervalId: any = null;
  private lastPollTimestamp: number = 0;

  private connectedDevices: Map<string, ConnectedDevice> = new Map();
  private callbacks: MeshNetworkCallbacks = {};

  constructor(
    sessionId: string,
    deviceId: string,
    deviceName: string,
    initialRole: DeviceRole = "master_console",
    isAuthority: boolean = false
  ) {
    this.sessionId = sessionId;
    this.myDeviceId = deviceId;
    this.myDeviceName = deviceName;
    this.myRole = initialRole;
    this.isAuthority = isAuthority;
    this.clockSync = new ClockSyncManager(isAuthority);
  }

  public init(callbacks: MeshNetworkCallbacks) {
    this.callbacks = callbacks;
    this.setConnectionStatus("connecting");

    // 1. Initialize BroadcastChannel for instant local inter-tab/inter-window communication
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.broadcastChannel = new BroadcastChannel(`paceframe_${this.sessionId}`);
        this.broadcastChannel.onmessage = (e) => {
          this.handleIncomingMessage(e.data);
        };
      } catch (err) {
        console.warn("BroadcastChannel unavailable:", err);
      }
    }

    // 2. Start HTTP signaling poll for cross-device physical communication
    this.startHttpPolling();

    // 3. Register self in device map
    this.registerSelf();

    // 4. Send join broadcast
    this.broadcastMessage("JOIN_REQUEST", {
      deviceId: this.myDeviceId,
      deviceName: this.myDeviceName,
      role: this.myRole,
      isAuthority: this.isAuthority,
    });

    // 5. Start periodic heartbeats
    this.heartbeatIntervalId = setInterval(() => {
      this.sendHeartbeat();
      this.pruneStaleDevices();
    }, 2500);

    // 6. Start periodic NTP clock synchronization if not authority
    if (!this.isAuthority) {
      this.startClockSyncLoop();
    }

    this.setConnectionStatus("ready");
  }

  public getClockSync(): ClockSyncManager {
    return this.clockSync;
  }

  public getRole(): DeviceRole {
    return this.myRole;
  }

  public setRole(newRole: DeviceRole) {
    this.myRole = newRole;
    this.registerSelf();
    this.broadcastMessage("ROLE_ASSIGNMENT", {
      targetDeviceId: this.myDeviceId,
      newRole,
    });
    this.callbacks.onRoleAssigned?.(newRole);
  }

  public setAuthority(isAuth: boolean) {
    this.isAuthority = isAuth;
    this.clockSync.setAuthority(isAuth);
    if (isAuth) {
      if (this.clockPingIntervalId) {
        clearInterval(this.clockPingIntervalId);
        this.clockPingIntervalId = null;
      }
    } else {
      this.startClockSyncLoop();
    }
  }

  private registerSelf() {
    const selfDevice: ConnectedDevice = {
      deviceId: this.myDeviceId,
      sessionId: this.sessionId,
      deviceName: `${this.myDeviceName} (This Device)`,
      deviceRole: this.myRole,
      connectionStatus: "ready",
      isAuthority: this.isAuthority,
      syncQuality: this.clockSync.getQuality(),
      lastHeartbeat: Date.now(),
    };
    this.connectedDevices.set(this.myDeviceId, selfDevice);
    this.callbacks.onDeviceListUpdate?.(Array.from(this.connectedDevices.values()));
  }

  private setConnectionStatus(status: ConnectionStatus) {
    this.connectionStatus = status;
    this.callbacks.onConnectionStatusChange?.(status);
  }

  /**
   * Broadcast message through both BroadcastChannel (local) and API Relay (cross-network)
   */
  public broadcastMessage(type: NetworkMessage["type"], payload: any, targetDeviceId?: string) {
    const msg: NetworkMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      sessionId: this.sessionId,
      senderDeviceId: this.myDeviceId,
      senderName: this.myDeviceName,
      timestamp: performance.now(),
      payload: { ...payload, targetDeviceId },
    };

    // 1. Local BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch {}
    }

    // 2. HTTP Signaling Relay
    if (typeof window !== "undefined") {
      fetch("/api/signaling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          sessionId: this.sessionId,
          deviceId: this.myDeviceId,
          deviceName: this.myDeviceName,
          role: this.myRole,
          message: msg,
        }),
      }).catch(() => {});
    }
  }

  private startHttpPolling() {
    this.lastPollTimestamp = Date.now();
    this.pollIntervalId = setInterval(async () => {
      try {
        const res = await fetch("/api/signaling", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "poll",
            sessionId: this.sessionId,
            deviceId: this.myDeviceId,
            since: this.lastPollTimestamp,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          this.lastPollTimestamp = data.serverTime || Date.now();

          if (data.messages && Array.isArray(data.messages)) {
            for (const m of data.messages) {
              if (m.data) {
                this.handleIncomingMessage(m.data);
              }
            }
          }
        }
      } catch {
        // Tolerant network retry
      }
    }, 1200);
  }

  private startClockSyncLoop() {
    if (this.clockPingIntervalId) clearInterval(this.clockPingIntervalId);

    // Initial rapid burst of 5 pings for immediate calibration
    let initialCount = 0;
    const initialBurst = setInterval(() => {
      this.sendClockPing();
      initialCount++;
      if (initialCount >= 5) {
        clearInterval(initialBurst);
      }
    }, 200);

    // Continuous steady ping every 3 seconds
    this.clockPingIntervalId = setInterval(() => {
      this.sendClockPing();
    }, 3000);
  }

  private sendClockPing() {
    const { t1 } = this.clockSync.createPingPayload();
    this.broadcastMessage("CLOCK_PING", { t1 });
  }

  private sendHeartbeat() {
    this.broadcastMessage("HEARTBEAT", {
      role: this.myRole,
      isAuthority: this.isAuthority,
      syncQuality: this.clockSync.getQuality(),
    });
  }

  private pruneStaleDevices() {
    const now = Date.now();
    let changed = false;

    for (const [id, dev] of this.connectedDevices.entries()) {
      if (id === this.myDeviceId) continue;
      if (now - dev.lastHeartbeat > 8000) {
        // Device timed out
        this.connectedDevices.delete(id);
        changed = true;
      }
    }

    if (changed) {
      this.callbacks.onDeviceListUpdate?.(Array.from(this.connectedDevices.values()));
    }
  }

  private handleIncomingMessage(msg: NetworkMessage) {
    if (!msg || msg.senderDeviceId === this.myDeviceId) return;

    // Check targeted device
    if (msg.payload?.targetDeviceId && msg.payload.targetDeviceId !== this.myDeviceId) {
      return;
    }

    switch (msg.type) {
      case "JOIN_REQUEST": {
        // Register new peer
        const newDevice: ConnectedDevice = {
          deviceId: msg.senderDeviceId,
          sessionId: this.sessionId,
          deviceName: msg.senderName,
          deviceRole: msg.payload.role || "secondary_camera",
          connectionStatus: "ready",
          isAuthority: !!msg.payload.isAuthority,
          syncQuality: {
            rttMs: 0,
            clockOffsetMs: 0,
            jitterMs: 0,
            samplesCount: 0,
            quality: "uncalibrated",
          },
          lastHeartbeat: Date.now(),
        };
        this.connectedDevices.set(msg.senderDeviceId, newDevice);
        this.callbacks.onDeviceListUpdate?.(Array.from(this.connectedDevices.values()));

        // Respond with acknowledgment
        this.broadcastMessage(
          "JOIN_ACCEPTED",
          {
            role: this.myRole,
            isAuthority: this.isAuthority,
          },
          msg.senderDeviceId
        );
        break;
      }

      case "JOIN_ACCEPTED": {
        const peer: ConnectedDevice = {
          deviceId: msg.senderDeviceId,
          sessionId: this.sessionId,
          deviceName: msg.senderName,
          deviceRole: msg.payload.role || "secondary_camera",
          connectionStatus: "ready",
          isAuthority: !!msg.payload.isAuthority,
          syncQuality: {
            rttMs: 0,
            clockOffsetMs: 0,
            jitterMs: 0,
            samplesCount: 0,
            quality: "uncalibrated",
          },
          lastHeartbeat: Date.now(),
        };
        this.connectedDevices.set(msg.senderDeviceId, peer);
        this.callbacks.onDeviceListUpdate?.(Array.from(this.connectedDevices.values()));
        break;
      }

      case "HEARTBEAT": {
        let dev = this.connectedDevices.get(msg.senderDeviceId);
        if (!dev) {
          dev = {
            deviceId: msg.senderDeviceId,
            sessionId: this.sessionId,
            deviceName: msg.senderName,
            deviceRole: msg.payload.role,
            connectionStatus: "ready",
            isAuthority: !!msg.payload.isAuthority,
            syncQuality: msg.payload.syncQuality || {
              rttMs: 0,
              clockOffsetMs: 0,
              jitterMs: 0,
              samplesCount: 0,
              quality: "uncalibrated",
            },
            lastHeartbeat: Date.now(),
          };
          this.connectedDevices.set(msg.senderDeviceId, dev);
        } else {
          dev.lastHeartbeat = Date.now();
          if (msg.payload.role) dev.deviceRole = msg.payload.role;
          if (msg.payload.syncQuality) dev.syncQuality = msg.payload.syncQuality;
        }
        this.callbacks.onDeviceListUpdate?.(Array.from(this.connectedDevices.values()));
        break;
      }

      case "CLOCK_PING": {
        // If this device is the authority, process ping and return pong
        if (this.isAuthority) {
          const { t1 } = msg.payload;
          const { t2, t3 } = this.clockSync.handlePingAtAuthority(t1);
          this.broadcastMessage(
            "CLOCK_PONG",
            { t1, t2, t3 },
            msg.senderDeviceId
          );
        }
        break;
      }

      case "CLOCK_PONG": {
        // Client receives authority pong
        if (!this.isAuthority) {
          const { t1, t2, t3 } = msg.payload;
          const quality = this.clockSync.handlePongAtClient(t1, t2, t3);
          this.callbacks.onSyncQualityUpdate?.(quality);

          // Update self device entry
          const selfDev = this.connectedDevices.get(this.myDeviceId);
          if (selfDev) {
            selfDev.syncQuality = quality;
            this.callbacks.onDeviceListUpdate?.(Array.from(this.connectedDevices.values()));
          }
        }
        break;
      }

      case "ROLE_ASSIGNMENT": {
        if (msg.payload.targetDeviceId === this.myDeviceId && msg.payload.newRole) {
          this.myRole = msg.payload.newRole;
          this.registerSelf();
          this.callbacks.onRoleAssigned?.(this.myRole);
        }
        // Update device in map
        const target = this.connectedDevices.get(msg.payload.targetDeviceId);
        if (target && msg.payload.newRole) {
          target.deviceRole = msg.payload.newRole;
          this.callbacks.onDeviceListUpdate?.(Array.from(this.connectedDevices.values()));
        }
        break;
      }

      case "TIMING_EVENT": {
        if (msg.payload.event) {
          this.callbacks.onTimingEventReceived?.(msg.payload.event);
        }
        break;
      }

      case "MANUAL_TRIGGER": {
        if (msg.payload.trigger) {
          this.callbacks.onManualTriggerReceived?.(msg.payload.trigger);
        }
        break;
      }
    }
  }

  /**
   * Broadcast a detected timing event to all devices in the session
   */
  public emitTimingEvent(event: TimingEvent) {
    this.broadcastMessage("TIMING_EVENT", { event });
  }

  /**
   * Reassign another device's role (called by Coach console)
   */
  public assignRemoteDeviceRole(targetDeviceId: string, newRole: DeviceRole) {
    const target = this.connectedDevices.get(targetDeviceId);
    if (target) {
      target.deviceRole = newRole;
      this.callbacks.onDeviceListUpdate?.(Array.from(this.connectedDevices.values()));
    }
    this.broadcastMessage(
      "ROLE_ASSIGNMENT",
      { targetDeviceId, newRole },
      targetDeviceId
    );
  }

  /**
   * Emit manual start/arm trigger
   */
  public emitManualTrigger(type: "ARM" | "START" | "STOP", timestamp: number = performance.now()) {
    const syncTime = this.clockSync.toSynchronizedTime(timestamp);
    this.broadcastMessage("MANUAL_TRIGGER", {
      trigger: { type, timestamp: syncTime },
    });
  }

  public destroy() {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (this.pollIntervalId) clearInterval(this.pollIntervalId);
    if (this.heartbeatIntervalId) clearInterval(this.heartbeatIntervalId);
    if (this.clockPingIntervalId) clearInterval(this.clockPingIntervalId);
    this.connectedDevices.clear();
    this.setConnectionStatus("disconnected");
  }
}

