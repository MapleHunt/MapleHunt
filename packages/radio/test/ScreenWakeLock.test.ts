import { describe, expect, it, vi } from "vitest";
import { ScreenWakeLock } from "../src/ScreenWakeLock";

function fakeEnv() {
  let visibility: DocumentVisibilityState = "visible";
  const listeners = new Set<() => void>();
  const sentinels: Array<{ release: ReturnType<typeof vi.fn> }> = [];
  const request = vi.fn(async () => {
    const s = { release: vi.fn(async () => {}) };
    sentinels.push(s);
    return s;
  });
  const env = {
    wakeLock: { request },
    document: {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    } as unknown as Document,
  };
  const setVisibility = async (v: DocumentVisibilityState) => {
    visibility = v;
    for (const l of listeners) l();
    await Promise.resolve();
  };
  return { env, request, sentinels, setVisibility, listeners };
}

describe("ScreenWakeLock", () => {
  it("asks for the screen lock once", async () => {
    const { env, request } = fakeEnv();
    const lock = new ScreenWakeLock(env);

    await lock.acquire();
    await lock.acquire();

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("screen");
    expect(lock.held).toBe(true);
  });

  it("asks again when the app comes back to the foreground", async () => {
    const { env, request, setVisibility } = fakeEnv();
    const lock = new ScreenWakeLock(env);
    await lock.acquire();

    await setVisibility("hidden");
    expect(lock.held).toBe(false);
    await setVisibility("visible");

    expect(request).toHaveBeenCalledTimes(2);
    expect(lock.held).toBe(true);
  });

  it("lets go and stops listening on release", async () => {
    const { env, request, sentinels, setVisibility, listeners } = fakeEnv();
    const lock = new ScreenWakeLock(env);
    await lock.acquire();

    await lock.release();
    await setVisibility("visible");

    expect(sentinels[0]!.release).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
    expect(request).toHaveBeenCalledOnce();
  });

  it("carries on when the browser refuses or has no Wake Lock API", async () => {
    const { env } = fakeEnv();
    env.wakeLock.request.mockRejectedValueOnce(new Error("NotAllowedError"));
    await expect(new ScreenWakeLock(env).acquire()).resolves.toBeUndefined();
    await expect(new ScreenWakeLock({ document: env.document }).acquire()).resolves.toBeUndefined();
  });
});
