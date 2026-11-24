import type { RadioService } from "./RadioService";

export interface GpsFix {
  lat: number;
  lon: number;
  /** Epoch ms of the fix. */
  fixAt: number;
}

/** Where fixes come from: the Geolocation API in the app, a fake in tests. */
export type FixSource = () => Promise<GpsFix | null>;

/** Injectable timers, so tests don't need to wait 60 s. */
export interface Scheduler {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const realScheduler: Scheduler = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
};

export interface BroadcasterOptions {
  /** Report interval. Default 60 s (party positions every 60 s). */
  intervalMs?: number;
  scheduler?: Scheduler;
  /** Called when a send fails (e.g. Bluetooth dropped). The loop keeps running. */
  onError?: (err: unknown) => void;
  onSent?: (fix: GpsFix) => void;
}

/**
 * Sends this phone's position to the party every interval. If there is no
 * fix, nothing is sent: the rest of the party then sees "last heard" grow
 * and eventually "lost contact" — silence looks like silence.
 */
export class PositionBroadcaster {
  private handle: unknown = null;
  private readonly intervalMs: number;
  private readonly scheduler: Scheduler;
  private readonly onError: (err: unknown) => void;
  private readonly onSent: (fix: GpsFix) => void;

  constructor(
    private readonly radio: RadioService,
    private readonly getFix: FixSource,
    options: BroadcasterOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 60_000;
    this.scheduler = options.scheduler ?? realScheduler;
    this.onError = options.onError ?? (() => {});
    this.onSent = options.onSent ?? (() => {});
  }

  get running(): boolean {
    return this.handle !== null;
  }

  /** Start sending. Sends once immediately, then every interval. */
  start(): void {
    if (this.running) return;
    this.handle = this.scheduler.setInterval(() => void this.sendNow(), this.intervalMs);
    void this.sendNow();
  }

  stop(): void {
    if (!this.running) return;
    this.scheduler.clearInterval(this.handle);
    this.handle = null;
  }

  /** Take a fix and send it. Returns true if a position went out. */
  async sendNow(): Promise<boolean> {
    try {
      const fix = await this.getFix();
      if (!fix || this.radio.getConnection() !== "connected") return false;
      await this.radio.sendPosition(fix);
      this.onSent(fix);
      return true;
    } catch (err) {
      this.onError(err);
      return false;
    }
  }
}
