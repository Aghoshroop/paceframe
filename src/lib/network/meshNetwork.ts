// Real-Time Multi-Device Mesh Network with Dual-Transport (BroadcastChannel + Fast HTTP Relay)
// Implements Monotonic Sequence Message Delivery & Server-Synchronized Device Presence

import {
  ConnectedDevice,
  DeviceRole,
  ConnectionStatus,
  NetworkMessage,
  TimingEvent,
  SyncQuality,
} from "@/types";
import { ClockSyncManager, getPreciseTime } from "@/lib/timing/clockSync";

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
  private lastSeenSeq: number = 0;
  private isPollingActive: boolean = false;

  private connectedDevices: Map<string, ConnectedDevice> = new Map();
  private callbacks: MeshNetworkCallbacks = {};

  constructor(
    sessionId: string,
    deviceId: string,
    deviceName: string,
    initialRole: DeviceRole = "master_console",
    isAuthority: boolean = false
  ) {
    this.sessionId = sessionId.trim().toUpperCase();
    this.myDeviceId = deviceId;
    this.myDeviceName = deviceName;
    this.myRole = initialRole;
    this.isAuthority = isAuthority;
    this.clockSync = new ClockSyncManager(isAuthority);
  }

  public init(callbacks: MeshNetworkCallbacks) {
    this.callbacks = callbacks;
    this.setConnectionStatus("connecting");

    // 1. Initialize BroadcastChannel for same-origin tabs/windows
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

    // 2. Register self in local device map
    this.registerSelf();

    // 3. Start high-frequency HTTP signaling relay poll (250ms for low-latency athletic sync)
    this.startHttpPolling();

    // 4. Send initial join broadcast
    this.broadcastMessage("JOIN_REQUEST", {
      deviceId: this.myDeviceId,
      deviceName: this.myDeviceName,
      role: this.myRole,
      isAuthority: this.isAuthority,
    });

    // 5. Periodic local device pruning
    this.heartbeatIntervalId = setInterval(() => {
      this.sendHeartbeat();
    }, 2000);

    // 6. Start NTP clock synchronization loop if not authority
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

    // Immediately notify server of role change
    this.pollRelay();

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
    this.registerSelf();
    this.pollRelay();
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
      timestamp: getPreciseTime(),
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
          isAuthority: this.isAuthority,
          message: msg,
        }),
      }).catch(() => {});
    }
  }

  private startHttpPolling() {
    // Initial poll immediately
    this.pollRelay();

    // 250ms polling loop for instant responsive device discovery and low-latency line breaks
    this.pollIntervalId = setInterval(() => {
      this.pollRelay();
    }, 250);
  }

  private async pollRelay() {
    if (this.isPollingActive || typeof window === "undefined") return;
    this.isPollingActive = true;

    try {
      const res = await fetch("/api/signaling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "poll",
          sessionId: this.sessionId,
          deviceId: this.myDeviceId,
          deviceName: this.myDeviceName,
          role: this.myRole,
          isAuthority: this.isAuthority,
          lastSeq: this.lastSeenSeq,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof data.lastSeq === "number") {
          this.lastSeenSeq = data.lastSeq;
        }

        // 1. Synchronize connected devices directly from active presence registry
        if (data.devices && Array.isArray(data.devices)) {
          this.syncDevicesFromServer(data.devices);
        }

        // 2. Deliver unread network messages
        if (data.messages && Array.isArray(data.messages)) {
          for (const m of data.messages) {
            if (m.data) {
              this.handleIncomingMessage(m.data);
            }
          }
        }
      }
    } catch {
      // Tolerant retry
    } finally {
      this.isPollingActive = false;
    }
  }

  /**
   * Sync active devices map directly from server presence registry
   */
  private syncDevicesFromServer(serverDevices: Array<{ deviceId: string; deviceName: string; role: DeviceRole; isAuthority: boolean; lastSeen: number }>) {
    const serverDevIds = new Set(serverDevices.map((d) => d.deviceId));
    let hasChanges = false;

    // Add or update remote devices
    for (const remote of serverDevices) {
      if (remote.deviceId === this.myDeviceId) continue;

      const existing = this.connectedDevices.get(remote.deviceId);
      if (!existing) {
        this.connectedDevices.set(remote.deviceId, {
          deviceId: remote.deviceId,
          sessionId: this.sessionId,
          deviceName: remote.deviceName,
          deviceRole: remote.role || "secondary_camera",
          connectionStatus: "ready",
          isAuthority: remote.isAuthority,
          syncQuality: {
            rttMs: 0,
            clockOffsetMs: 0,
            jitterMs: 0.5,
            samplesCount: 1,
            quality: "good",
          },
          lastHeartbeat: remote.lastSeen,
        });
        hasChanges = true;
      } else {
        if (existing.deviceRole !== remote.role) {
          existing.deviceRole = remote.role;
          hasChanges = true;
        }
        if (existing.deviceName !== remote.deviceName) {
          existing.deviceName = remote.deviceName;
          hasChanges = true;
        }
        existing.lastHeartbeat = remote.lastSeen;
      }
    }

    // Prune devices no longer in server registry
    for (const [id] of this.connectedDevices.entries()) {
      if (id === this.myDeviceId) continue;
      if (!serverDevIds.has(id)) {
        this.connectedDevices.delete(id);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.callbacks.onDeviceListUpdate?.(Array.from(this.connectedDevices.values()));
    }
  }

  private startClockSyncLoop() {
    if (this.clockPingIntervalId) clearInterval(this.clockPingIntervalId);

    // Initial rapid burst of 5 pings for immediate calibration within first 1.5 seconds
    let initialCount = 0;
    const initialBurst = setInterval(() => {
      this.sendClockPing();
      initialCount++;
      if (initialCount >= 5) {
        clearInterval(initialBurst);
      }
    }, 300);

    // Continuous steady ping every 2.5 seconds
    this.clockPingIntervalId = setInterval(() => {
      this.sendClockPing();
    }, 2500);
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

  private handleIncomingMessage(msg: NetworkMessage) {
    if (!msg || msg.senderDeviceId === this.myDeviceId) return;

    // Check targeted device
    if (msg.payload?.targetDeviceId && msg.payload.targetDeviceId !== this.myDeviceId) {
      return;
    }

    switch (msg.type) {
      case "JOIN_REQUEST": {
        const peerRole = msg.payload.role || "secondary_camera";
        const newDevice: ConnectedDevice = {
          deviceId: msg.senderDeviceId,
          sessionId: this.sessionId,
          deviceName: msg.senderName,
          deviceRole: peerRole,
          connectionStatus: "ready",
          isAuthority: !!msg.payload.isAuthority,
          syncQuality: {
            rttMs: 0,
            clockOffsetMs: 0,
            jitterMs: 0.5,
            samplesCount: 1,
            quality: "good",
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
            jitterMs: 0.5,
            samplesCount: 1,
            quality: "good",
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
            deviceRole: msg.payload.role || "secondary_camera",
            connectionStatus: "ready",
            isAuthority: !!msg.payload.isAuthority,
            syncQuality: msg.payload.syncQuality || {
              rttMs: 0,
              clockOffsetMs: 0,
              jitterMs: 0.5,
              samplesCount: 1,
              quality: "good",
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
  public emitManualTrigger(type: "ARM" | "START" | "STOP", timestamp: number = getPreciseTime()) {
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
