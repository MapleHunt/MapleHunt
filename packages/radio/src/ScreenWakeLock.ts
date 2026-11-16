import type { WakeLockLike } from "./MeshtasticRadio";

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export interface WakeLockEnvironment {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
}

/**
 * Keeps the phone screen on while the radio is in use, because Android drops
 * the Bluetooth link soon after the screen turns off. The browser releases the
 * lock whenever the page is hidden, so it is asked for again when the page
 * comes back. Does nothing where the Wake Lock API is missing.
 */
export class ScreenWakeLock implements WakeLockLike {
  private sentinel: WakeLockSentinelLike | null = null;
  private wanted = false;

  constructor(
    private readonly env: WakeLockEnvironment = {
      wakeLock: (globalThis.navigator as Navigator | undefined)?.wakeLock,
      document: globalThis.document,
    },
  ) {}

  get held(): boolean {
    return this.sentinel !== null;
  }

  async acquire(): Promise<void> {
    if (this.wanted) return;
    this.wanted = true;
    this.env.document.addEventListener("visibilitychange", this.onVisibilityChange);
    await this.request();
  }

  async release(): Promise<void> {
    if (!this.wanted) return;
    this.wanted = false;
    this.env.document.removeEventListener("visibilitychange", this.onVisibilityChange);
    const sentinel = this.sentinel;
    this.sentinel = null;
    await sentinel?.release();
  }

  private readonly onVisibilityChange = () => {
    if (this.env.document.visibilityState === "visible") void this.request();
    else this.sentinel = null;
  };

  private async request(): Promise<void> {
    if (!this.wanted || !this.env.wakeLock || this.env.document.visibilityState !== "visible") return;
    try {
      const sentinel = await this.env.wakeLock.request("screen");
      if (this.wanted) this.sentinel = sentinel;
      else await sentinel.release();
    } catch {
      // Refused (battery saver, page not focused). The radio still works, it just drops more often.
    }
  }
}
