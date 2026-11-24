import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE, buildStyle, OVERLAY_LAYERS, tileJsonUrl } from "../src/map/mapStyle";
import { activePackUrl, downloadPack, PACK_CACHE, packInCache, savedPack, sha256Hex } from "../src/map/mapPack";
import { parseServerCheck } from "../src/data/geo";

const PACK = "/pack.pmtiles";

describe("buildStyle with a map pack", () => {
  const style = buildStyle(PACK);

  it("reads the basemap from the pack", () => {
    expect(tileJsonUrl(PACK)).toBe(`pmtiles://${location.origin}/pack.pmtiles`);
    expect(style.sources[BASE]).toMatchObject({ type: "vector", url: tileJsonUrl(PACK) });
  });

  it("draws WMU and land from the pack's own layers", () => {
    for (const id of [...OVERLAY_LAYERS.wmu, ...OVERLAY_LAYERS.land]) {
      const layer = style.layers.find((l) => l.id === id) as { source: string; "source-layer"?: string };
      expect(layer.source).toBe(BASE);
      expect(layer["source-layer"]).toBe(id.startsWith("wmu") ? "wmu" : "land");
    }
  });

  it("still draws the 5 km ring from its geojson source", () => {
    expect(style.layers.find((l) => l.id === "ring-line")).toMatchObject({ source: "ring" });
  });
});

/** Minimal Cache Storage: enough for put / match / keys / delete by URL. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    stores,
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        put: async (key: string, res: Response) => void store.set(key, res),
        match: async (key: string) => store.get(key),
        keys: async () => [...store.keys()].map((url) => ({ url })),
        delete: async (req: string | { url: string }) => store.delete(typeof req === "string" ? req : req.url),
      };
    },
    delete: async (name: string) => stores.delete(name),
  };
}

const MANIFEST = "https://maps.example/storage/v1/object/public/map-packs/manifest.json";
const PACK_V1 = "https://maps.example/storage/v1/object/public/map-packs/v1/pack.pmtiles";
const bytes = new Uint8Array(1000).map((_, i) => i % 251);

/** Serves a manifest and a pack; `served` lets a test hand back damaged bytes. */
function server(opts: { sha256: string; served?: Uint8Array; manifestBytes?: number }) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === MANIFEST) {
      return Response.json({ version: "v1", path: "v1/pack.pmtiles", sha256: opts.sha256, bytes: opts.manifestBytes ?? bytes.length });
    }
    if (url === PACK_V1) {
      const body = opts.served ?? bytes;
      return new Response(body as BodyInit, { status: 200, headers: { "content-length": String(body.length), etag: '"v1"' } });
    }
    return new Response("not found", { status: 404 });
  });
}

describe("downloadPack", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("follows the manifest, checks the checksum and stores the whole file for the map", async () => {
    const caches = fakeCaches();
    const fetchMock = server({ sha256: await sha256Hex(bytes) });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("caches", caches);

    const progress: number[] = [];
    const pack = await downloadPack((done) => progress.push(done), MANIFEST);

    expect(pack).toMatchObject({ version: "v1", url: PACK_V1, bytes: 1000 });
    expect(progress.at(-1)).toBe(1000);
    const packCall = fetchMock.mock.calls.find(([url]) => url === PACK_V1)!;
    expect(new Headers(packCall[1]?.headers).has("range")).toBe(false);

    const saved = caches.stores.get(PACK_CACHE)!.get(PACK_V1)!;
    expect(saved.status).toBe(200);
    expect(saved.headers.get("etag")).toBe('"v1"');
    expect(new Uint8Array(await saved.arrayBuffer())).toEqual(bytes);
    expect(savedPack()?.version).toBe("v1");
    expect(await packInCache()).toBe(true);
  });

  it("refuses a damaged download and keeps nothing", async () => {
    const caches = fakeCaches();
    const damaged = bytes.slice();
    damaged[500] = 255 - bytes[500]!;
    vi.stubGlobal("fetch", server({ sha256: await sha256Hex(bytes), served: damaged }));
    vi.stubGlobal("caches", caches);

    await expect(downloadPack(() => undefined, MANIFEST)).rejects.toThrow("checksum");
    expect(caches.stores.get(PACK_CACHE)?.size ?? 0).toBe(0);
    expect(savedPack()).toBeNull();
  });

  it("refuses a download that was cut short", async () => {
    vi.stubGlobal("fetch", server({ sha256: await sha256Hex(bytes), manifestBytes: 5000 }));
    vi.stubGlobal("caches", fakeCaches());
    await expect(downloadPack(() => undefined, MANIFEST)).rejects.toThrow("cut short");
  });

  it("refuses a partial (206) response instead of caching it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 206 })));
    vi.stubGlobal("caches", fakeCaches());
    await expect(downloadPack(() => undefined, PACK)).rejects.toThrow("HTTP 206");
  });
});

describe("activePackUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("uses a plain .pmtiles URL as is", () => {
    expect(activePackUrl(PACK)).toBe(`${location.origin}/pack.pmtiles`);
  });

  it("uses online tiles until the manifest's pack is downloaded, then the saved version", async () => {
    expect(activePackUrl(MANIFEST)).toBe("");
    vi.stubGlobal("fetch", server({ sha256: await sha256Hex(bytes) }));
    vi.stubGlobal("caches", fakeCaches());
    await downloadPack(() => undefined, MANIFEST);
    expect(activePackUrl(MANIFEST)).toBe(PACK_V1);
  });

  it("uses online tiles when no pack is set up", () => {
    expect(activePackUrl("")).toBe("");
  });
});

describe("parseServerCheck", () => {
  it("reads the check_position result", () => {
    expect(
      parseServerCheck({ wmuCode: "87D", land: { status: "crown", message: "Crown land · Open — check WMU seasons", area: { id: 4, name: null, category: "crown" } } }),
    ).toEqual({ wmuCode: "87D", land: { status: "crown", message: "Crown land · Open — check WMU seasons", area: { id: 4, name: undefined, category: "crown" } } });
  });

  it("handles a point outside every WMU and land area", () => {
    expect(parseServerCheck({ wmuCode: null, land: { status: "check", message: "Check access", area: null } })).toEqual({
      wmuCode: null,
      land: { status: "check", message: "Check access", area: null },
    });
  });

  it("rejects anything else", () => {
    expect(parseServerCheck(null)).toBeNull();
    expect(parseServerCheck({ wmuCode: "87D" })).toBeNull();
    expect(parseServerCheck({ wmuCode: "87D", land: { status: "open", message: "x" } })).toBeNull();
  });
});
