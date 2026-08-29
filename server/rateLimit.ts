/**
 * In-memory sliding window rate limiter
 */

interface RateRecord {
  timestamps: number[];
}

export class RateLimiter {
  private records: Map<string, RateRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private windowMs: number = 60000,
    private maxRequests: number = 100
  ) {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    // Don't keep process alive solely for cleanup
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  public isAllowed(key: string, customLimit?: number): boolean {
    const limit = customLimit ?? this.maxRequests;
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [now] };
      this.records.set(key, record);
      return true;
    }

    // Filter out timestamps outside window
    record.timestamps = record.timestamps.filter((ts) => ts > cutoff);

    if (record.timestamps.length >= limit) {
      return false;
    }

    record.timestamps.push(now);
    return true;
  }

  public reset(key: string): void {
    this.records.delete(key);
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, record] of this.records.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
      if (record.timestamps.length === 0) {
        this.records.delete(key);
      }
    }
  }

  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.records.clear();
  }
}
