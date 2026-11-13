// Next.js API Signaling Endpoint for Multi-Device WebRTC / Event Relay
// Implements Monotonic Sequence-based Message Queuing & Live Active Device Presence

import { NextRequest, NextResponse } from "next/server";

interface DeviceRecord {
  deviceId: string;
  deviceName: string;
  role: string;
  isAuthority: boolean;
  lastSeen: number;
}

interface QueuedMessage {
  seq: number;
  id: string;
  targetDeviceId?: string;
  senderDeviceId: string;
  timestamp: number;
  data: any;
}

interface SessionMailbox {
  lastSeq: number;
  messages: QueuedMessage[];
  devices: Map<string, DeviceRecord>;
}

// In-memory sessions storage
const sessions = new Map<string, SessionMailbox>();

// Periodic cleanup of stale sessions (> 2 hours)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, mailbox] of sessions.entries()) {
    for (const [devId, dev] of mailbox.devices.entries()) {
      if (dev.lastSeen < cutoff) {
        mailbox.devices.delete(devId);
      }
    }
    if (mailbox.devices.size === 0 && mailbox.messages.length === 0) {
      sessions.delete(id);
    }
  }
}, 60000);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      sessionId,
      deviceId,
      deviceName,
      role,
      isAuthority,
      message,
      lastSeq,
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const cleanSessionId = sessionId.trim().toUpperCase();

    let mailbox = sessions.get(cleanSessionId);
    if (!mailbox) {
      mailbox = {
        lastSeq: 0,
        messages: [],
        devices: new Map(),
      };
      sessions.set(cleanSessionId, mailbox);
    }

    const now = Date.now();

    // 1. Register / Update device presence
    if (deviceId) {
      const existing = mailbox.devices.get(deviceId);
      mailbox.devices.set(deviceId, {
        deviceId,
        deviceName: deviceName || existing?.deviceName || "PACEFRAME Device",
        role: role || existing?.role || "finish_camera",
        isAuthority: typeof isAuthority === "boolean" ? isAuthority : existing?.isAuthority || false,
        lastSeen: now,
      });
    }

    // 2. Action: Post a message (TIMING_EVENT, CLOCK_PING, JOIN_REQUEST, etc.)
    if (action === "send" && message) {
      const targetDevId =
        message.targetDeviceId || message.payload?.targetDeviceId || undefined;

      mailbox.lastSeq += 1;
      const msgObj: QueuedMessage = {
        seq: mailbox.lastSeq,
        id: `msg_${now}_${Math.random().toString(36).substring(2, 6)}`,
        targetDeviceId: targetDevId,
        senderDeviceId: deviceId,
        timestamp: now,
        data: message,
      };

      mailbox.messages.push(msgObj);

      // Keep only last 150 messages in circular buffer
      if (mailbox.messages.length > 150) {
        mailbox.messages.shift();
      }

      return NextResponse.json({
        success: true,
        seq: msgObj.seq,
        messageId: msgObj.id,
      });
    }

    // 3. Action: Poll unread messages and active devices
    if (action === "poll") {
      const sinceSeq = Number(lastSeq) || 0;

      // Filter unread messages using monotonic sequence (immune to clock skew!)
      const unread = mailbox.messages.filter((m) => {
        if (m.seq <= sinceSeq) return false;
        if (m.senderDeviceId === deviceId) return false;
        if (m.targetDeviceId && m.targetDeviceId !== deviceId) return false;
        return true;
      });

      // Prune devices inactive for > 10 seconds
      for (const [devId, dev] of mailbox.devices.entries()) {
        if (now - dev.lastSeen > 10000) {
          mailbox.devices.delete(devId);
        }
      }

      const activeDevices = Array.from(mailbox.devices.values());

      return NextResponse.json({
        messages: unread,
        lastSeq: mailbox.lastSeq,
        devices: activeDevices,
        serverTime: now,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
