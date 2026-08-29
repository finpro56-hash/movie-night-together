import { DCSyncMessage, DCPingMessage, DCPongMessage } from '../types/protocol';

export interface SyncConfig {
  syncIntervalMs: number;
  smallDriftMs: number;
  largeDriftMs: number;
  maxRttHistory: number;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  syncIntervalMs: 500,
  smallDriftMs: 80,
  largeDriftMs: 750,
  maxRttHistory: 10,
};

export class SyncManager {
  private config: SyncConfig;
  private rttSamples: number[] = [];
  private currentRtt: number = 50; // Default estimate 50ms
  private pendingPings: Map<string, number> = new Map();
  private lastSyncState: DCSyncMessage | null = null;
  private lastDriftMs: number = 0;

  constructor(config?: Partial<SyncConfig>) {
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
  }

  /**
   * Creates a ping message for RTT measurement
   */
  public createPing(): DCPingMessage {
    const id = Math.random().toString(36).substring(2, 9);
    const sentAt = performance.now();
    this.pendingPings.set(id, sentAt);

    return {
      type: 'PING',
      id,
      sentAt: Date.now(),
    };
  }

  /**
   * Handles incoming PING message and prepares PONG
   */
  public handlePing(ping: DCPingMessage): DCPongMessage {
    return {
      type: 'PONG',
      id: ping.id,
      pingSentAt: ping.sentAt,
      pongSentAt: Date.now(),
    };
  }

  /**
   * Handles incoming PONG message to record RTT
   */
  public handlePong(pong: DCPongMessage): number {
    const now = performance.now();
    const sentAt = this.pendingPings.get(pong.id);

    if (sentAt !== undefined) {
      const rtt = now - sentAt;
      this.pendingPings.delete(pong.id);
      this.addRttSample(rtt);
      return rtt;
    }

    // Fallback if local performance timestamp was lost
    const clockDiff = Date.now() - pong.pingSentAt;
    const rtt = Math.max(10, clockDiff);
    this.addRttSample(rtt);
    return rtt;
  }

  private addRttSample(rtt: number): void {
    this.rttSamples.push(rtt);
    if (this.rttSamples.length > this.config.maxRttHistory) {
      this.rttSamples.shift();
    }
    // Calculate median RTT to filter out jitter spikes
    const sorted = [...this.rttSamples].sort((a, b) => a - b);
    this.currentRtt = sorted[Math.floor(sorted.length / 2)];
  }

  public getEstimatedRtt(): number {
    return this.currentRtt;
  }

  /**
   * Calculates expected host playback position taking network transit into account
   */
  public calculateExpectedHostTime(sync: DCSyncMessage, receiveTimestampMs: number = Date.now()): number {
    this.lastSyncState = sync;
    const oneWayLatencyMs = this.currentRtt / 2;
    const elapsedSinceSentSec = Math.max(0, receiveTimestampMs - sync.sentAt - oneWayLatencyMs) / 1000;

    if (sync.state === 'playing') {
      return sync.time + elapsedSinceSentSec * sync.playbackRate;
    }

    return sync.time;
  }

  /**
   * Evaluates drift between local viewer time and expected host time
   * Positive drift: Viewer is ahead of Host
   * Negative drift: Viewer is behind Host
   */
  public evaluateDrift(
    viewerCurrentTimeSec: number,
    expectedHostTimeSec: number
  ): {
    driftMs: number;
    action: 'NONE' | 'GENTLE_SPEED_UP' | 'GENTLE_SLOW_DOWN' | 'HARD_SYNC';
    recommendedRate: number;
  } {
    const driftSec = viewerCurrentTimeSec - expectedHostTimeSec;
    const driftMs = driftSec * 1000;
    this.lastDriftMs = driftMs;

    const absDriftMs = Math.abs(driftMs);

    if (absDriftMs <= this.config.smallDriftMs) {
      return {
        driftMs,
        action: 'NONE',
        recommendedRate: 1.0,
      };
    }

    if (absDriftMs <= this.config.largeDriftMs) {
      // Viewer ahead -> slow down slightly
      // Viewer behind -> speed up slightly
      if (driftMs > 0) {
        return {
          driftMs,
          action: 'GENTLE_SLOW_DOWN',
          recommendedRate: 0.97,
        };
      } else {
        return {
          driftMs,
          action: 'GENTLE_SPEED_UP',
          recommendedRate: 1.03,
        };
      }
    }

    return {
      driftMs,
      action: 'HARD_SYNC',
      recommendedRate: 1.0,
    };
  }

  public getLastDriftMs(): number {
    return this.lastDriftMs;
  }

  public reset(): void {
    this.rttSamples = [];
    this.pendingPings.clear();
    this.lastSyncState = null;
    this.lastDriftMs = 0;
  }
}
