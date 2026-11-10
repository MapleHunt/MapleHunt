import { afterEach, describe, expect, it, vi } from "vitest";
import { headerBounds, openMapPack } from "../src/map/mapPack";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("headerBounds", () => {
  it("turns the PMTiles header into MapLibre bounds", () => {
    expect(headerBounds({ minLon: -80.4, minLat: 42.9, maxLon: -79.6, maxLat: 43.5 })).toEqual([
      [-80.4, 42.9],
      [-79.6, 43.5],
    ]);
  });
});

describe("openMapPack", () => {
  it("fetches a URL pack only once", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array(8)])));
    vi.stubGlobal("fetch", fetchMock);

    const a = await openMapPack({ url: "/once.pmtiles" });
    const b = await openMapPack({ url: "/once.pmtiles" });

    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed download", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(new Blob([new Uint8Array(8)])));
    vi.stubGlobal("fetch", fetchMock);

    await expect(openMapPack({ url: "/retry.pmtiles" })).rejects.toThrow("404");
    await expect(openMapPack({ url: "/retry.pmtiles" })).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens a local file without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await openMapPack({ file: new File([new Uint8Array(8)], "pack.pmtiles") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
