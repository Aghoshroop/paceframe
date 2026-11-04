// NTP-style High-Resolution Clock Synchronization for Multi-Device Precision

import { SyncQuality } from "@/types";

export interface ClockSample {
  t1: number; // Client send
  t2: number; // Authority receive
  t3: number; // Authority send
  t4: number; // Client receive
  rtt: number;
  offset: number;
}

export class ClockSyncManager {
  private samples: ClockSample[] = [];
  private maxSamples: number = 12;
  private currentOffset: number = 0;
  private currentJitter: number = 0;
  private currentRtt: number = 0;

  // For host/authority device, offset is 0
  private isAuthority: boolean = false;

  constructor(isAuthority: boolean = false) {
    this.isAuthority = isAuthority;
  }

  public setAuthority(isAuth: boolean) {
    this.isAuthority = isAuth;
    if (isAuth) {
      this.currentOffset = 0;
      this.currentJitter = 0;
      this.currentRtt = 0;
      this.samples = [];
    }
  }

  public getIsAuthority(): boolean {
    return this.isAuthority;
  }

  /**
   * Called by client when preparing a ping packet
   */
  public createPingPayload(): { t1: number } {
    return {
      t1: performance.now(),
    };
  }

  /**
   * Called by Authority when ping arrives: returns t1, t2, and sends t3
   */
  public handlePingAtAuthority(t1: number): { t1: number; t2: number; t3: number } {
    const t2 = performance.now();
    const t3 = performance.now();
    return { t1, t2, t3 };
  }

  /**
   * Called by client when pong returns
   */
  public handlePongAtClient(t1: number, t2: number, t3: number): SyncQuality {
    if (this.isAuthority) {
      return this.getQuality();
    }

    const t4 = performance.now();
    const rtt = Math.max(0, (t4 - t1) - (t3 - t2));
    const offset = ((t2 - t1) + (t3 - t4)) / 2;

    const sample: ClockSample = { t1, t2, t3, t4, rtt, offset };
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    this.recalculate();
    return this.getQuality();
  }

  private recalculate() {
    if (this.samples.length === 0) return;

    // Filter out outlier RTTs (keep samples with RTT below 1.5 * minRTT or top 70% lowest RTT)
    const sortedByRtt = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    const bestSamples = sortedByRtt.slice(0, Math.max(2, Math.ceil(this.samples.length * 0.7)));

    // Calculate weighted average offset (lower RTT gets higher weight)
    let totalWeight = 0;
    let weightedOffsetSum = 0;

    for (const s of bestSamples) {
      const weight = 1 / Math.max(0.1, s.rtt);
      weightedOffsetSum += s.offset * weight;
      totalWeight += weight;
    }

    this.currentOffset = totalWeight > 0 ? weightedOffsetSum / totalWeight : 0;
    this.currentRtt = bestSamples.reduce((sum, s) => sum + s.rtt, 0) / bestSamples.length;

    // Calculate jitter (sample standard deviation of offset)
    if (bestSamples.length > 1) {
      const variance =
        bestSamples.reduce((sum, s) => sum + Math.pow(s.offset - this.currentOffset, 2), 0) /
        (bestSamples.length - 1);
      this.currentJitter = Math.sqrt(variance);
    } else {
      this.currentJitter = 1.0;
    }
  }

  /**
   * Convert local device performance.now() to authoritative session timestamp
   */
  public toSynchronizedTime(localPerfNow: number = performance.now()): number {
    if (this.isAuthority) return localPerfNow;
    return localPerfNow + this.currentOffset;
  }

  /**
   * Convert an authoritative session timestamp to local device performance.now()
   */
  public toLocalTime(syncTime: number): number {
    if (this.isAuthority) return syncTime;
    return syncTime - this.currentOffset;
  }

  public getQuality(): SyncQuality {
    if (this.isAuthority) {
      return {
        rttMs: 0,
        clockOffsetMs: 0,
        jitterMs: 0,
        samplesCount: 100,
        quality: "excellent",
      };
    }

    let quality: SyncQuality["quality"] = "uncalibrated";
    if (this.samples.length >= 3) {
      if (this.currentRtt < 15 && this.currentJitter < 3.0) {
        quality = "excellent";
      } else if (this.currentRtt < 40 && this.currentJitter < 8.0) {
        quality = "good";
      } else {
        quality = "fair";
      }
    }

    return {
      rttMs: Math.round(this.currentRtt * 10) / 10,
      clockOffsetMs: Math.round(this.currentOffset * 10) / 10,
      jitterMs: Math.round(this.currentJitter * 10) / 10,
      samplesCount: this.samples.length,
      quality,
    };
  }

  public reset() {
    this.samples = [];
    this.currentOffset = 0;
    this.currentJitter = 0;
    this.currentRtt = 0;
  }
}

