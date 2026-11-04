// Next.js API Signaling Endpoint for Multi-Device WebRTC / Event Relay

import { NextRequest, NextResponse } from "next/server";

// In-memory session message mailbox (keyed by sessionId)
interface SessionMailbox {
  messages: Array<{
    id: string;
    targetDeviceId?: string; // specific device or undefined for broadcast
    senderDeviceId: string;
    timestamp: number;
    data: any;
  }>;
  devices: Map<string, { deviceId: string; deviceName: string; role: string; lastSeen: number }>;
}

const sessions = new Map<string, SessionMailbox>();

// Clean up stale sessions (> 4 hours)
setInterval(() => {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [id, mailbox] of sessions.entries()) {
    for (const [devId, dev] of mailbox.devices.entries()) {
      if (dev.lastSeen < cutoff) {
        mailbox.devices.delete(devId);
      }
    }
    if (mailbox.devices.size === 0) {
      sessions.delete(id);
    }
  }
}, 60000);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, sessionId, deviceId, deviceName, role, message, since } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    let mailbox = sessions.get(sessionId);
    if (!mailbox) {
      mailbox = {
        messages: [],
        devices: new Map(),
      };
      sessions.set(sessionId, mailbox);
    }

    // Register / update device heartbeat
    if (deviceId) {
      mailbox.devices.set(deviceId, {
        deviceId,
        deviceName: deviceName || "PACEFRAME Device",
        role: role || "secondary_camera",
        lastSeen: Date.now(),
      });
    }

    // Action: post a message (SDP, ICE candidate, or timing event)
    if (action === "send" && message) {
      const msgObj = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        targetDeviceId: message.targetDeviceId,
        senderDeviceId: deviceId,
        timestamp: Date.now(),
        data: message,
      };
      mailbox.messages.push(msgObj);

      // Keep only last 100 messages per session
      if (mailbox.messages.length > 100) {
        mailbox.messages.shift();
      }

      return NextResponse.json({ success: true, messageId: msgObj.id });
    }

    // Action: poll messages
    if (action === "poll") {
      const sinceTime = Number(since) || 0;
      const unread = mailbox.messages.filter((m) => {
        // Not sent by self
        if (m.senderDeviceId === deviceId) return false;
        // Timestamp newer than since
        if (m.timestamp <= sinceTime) return false;
        // Broadcast or targeted to this device
        if (m.targetDeviceId && m.targetDeviceId !== deviceId) return false;
        return true;
      });

      const activeDevices = Array.from(mailbox.devices.values());
      return NextResponse.json({
        messages: unread,
        devices: activeDevices,
        serverTime: Date.now(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

