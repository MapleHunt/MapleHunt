import { useEffect, useState } from "react";
import { MAP_PACK_URL } from "../lib/supabase";

// T10 · Offline map pack download.
//
// VITE_MAP_PACK_URL is either
//   - the pack's manifest.json (published by pipeline/publish_pack.sh), or
//   - a .pmtiles file directly (local testing, e.g. /pack.pmtiles).
//
// "Save area offline" downloads the whole pack once (a plain 200, no Range header),
// checks its sha256, and stores it in the "map-packs" cache under the URL the map
// reads. The service worker answers the map's Range reads from that copy
// (rangeRequests in vite.config.ts), so the map works with no signal.
//
// Why Cache Storage and not OPFS: the map reads the pack through fetch, and only
// Cache Storage can answer those fetches inside the service worker. Both live in
// the same origin storage, and navigator.storage.persist() protects both.

/** Must match cacheName of the .pmtiles rule in vite.config.ts. */
export const PACK_CACHE = "map-packs";
const SAVED_KEY = "maplehunt.mapPack";

export interface PackManifest {
  version: string;
  path: string;
  sha256: string;
  bytes: number;
  bbox?: number[];
  builtAt?: string;
}

export interface SavedPack {
  version: string;
  url: string;
  sha256: string | null;
  bytes: number;
  savedAt: string;
  /** True when the browser agreed not to clear it when space runs low. */
  persisted: boolean;
}

export const isManifestUrl = (url: string) => /manifest\.json(\?|#|$)/.test(url);
const absolute = (url: string, base = location.href) => new URL(url, base).href;

export function savedPack(): SavedPack | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedPack) : null;
  } catch {
    return null;
  }
}

function rememberPack(pack: SavedPack | null) {
  try {
    if (pack) localStorage.setItem(SAVED_KEY, JSON.stringify(pack));
    else localStorage.removeItem(SAVED_KEY);
  } catch {
    // Private mode etc.: the pack still works this session from the cache.
  }
  listeners.forEach((l) => l());
}

/**
 * The .pmtiles URL the map should read, or "" for online tiles.
 * With a manifest, that's the version saved on this device (none saved yet → online tiles).
 */
export function activePackUrl(configured = MAP_PACK_URL): string {
  if (!configured) return "";
  if (!isManifestUrl(configured)) return absolute(configured);
  return savedPack()?.url ?? "";
}

export async function fetchManifest(manifestUrl = MAP_PACK_URL): Promise<PackManifest> {
  const res = await fetch(absolute(manifestUrl), { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't read the map pack list (HTTP ${res.status}).`);
  const m = (await res.json()) as Partial<PackManifest>;
  if (typeof m.version !== "string" || typeof m.path !== "string" || typeof m.sha256 !== "string" || typeof m.bytes !== "number") {
    throw new Error("The map pack list is not in the expected format.");
  }
  return m as PackManifest;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Where to download from, and what the checksum must be. */
async function resolveTarget(configured: string): Promise<{ url: string; version: string; sha256: string | null; bytes: number | null }> {
  if (isManifestUrl(configured)) {
    const m = await fetchManifest(configured);
    return { url: absolute(m.path, absolute(configured)), version: m.version, sha256: m.sha256.toLowerCase(), bytes: m.bytes };
  }
  const url = absolute(configured);
  // A plain .pmtiles may have a "<sha256>  pack.pmtiles" file next to it.
  let sha256: string | null = null;
  try {
    const res = await fetch(`${url}.sha256`, { cache: "no-store" });
    const first = res.ok ? (await res.text()).trim().split(/\s+/)[0] : "";
    if (first && /^[0-9a-f]{64}$/i.test(first)) sha256 = first.toLowerCase();
  } catch {
    // No checksum published: saved without one.
  }
  return { url, version: "local", sha256, bytes: null };
}

/** Downloads, verifies and stores the pack. Returns what was saved. */
export async function downloadPack(onProgress: (done: number, total: number) => void, configured = MAP_PACK_URL): Promise<SavedPack> {
  if (!configured) throw new Error("No map pack is set up for this build.");
  if (!("caches" in globalThis)) throw new Error("This browser can't save maps for offline use.");
  if (!navigator.onLine) throw new Error("Downloading the map needs signal.");

  const target = await resolveTarget(configured);
  const res = await fetch(target.url, { cache: "no-store" });
  if (res.status !== 200) throw new Error(`Map pack download failed (HTTP ${res.status}).`);
  const total = target.bytes ?? (Number(res.headers.get("content-length")) || 0);

  const chunks: Uint8Array[] = [];
  let done = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      chunks.push(r.value);
      done += r.value.byteLength;
      onProgress(done, total || done);
    }
  } else {
    const buf = new Uint8Array(await res.arrayBuffer());
    chunks.push(buf);
    done = buf.byteLength;
    onProgress(done, done);
  }
  const body = new Uint8Array(done);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.byteLength;
  }

  if (target.bytes !== null && done !== target.bytes) {
    throw new Error(`The map download was cut short (${done} of ${target.bytes} bytes). Try again.`);
  }
  if (target.sha256 && (await sha256Hex(body)) !== target.sha256) {
    throw new Error("The map download was damaged (checksum didn't match). Try again.");
  }

  // Keep ETag / Last-Modified: pmtiles compares them between reads.
  const headers = new Headers();
  for (const h of ["content-type", "etag", "last-modified"]) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("content-length", String(done));

  const cache = await caches.open(PACK_CACHE);
  await cache.put(target.url, new Response(body, { status: 200, headers }));
  // Drop older versions so they don't use up space.
  for (const req of await cache.keys()) if (req.url !== target.url) await cache.delete(req);

  const persisted = (await navigator.storage?.persist?.().catch(() => false)) ?? false;
  const pack: SavedPack = { version: target.version, url: target.url, sha256: target.sha256, bytes: done, savedAt: new Date().toISOString(), persisted };
  rememberPack(pack);
  return pack;
}

/** True when the saved pack's file is really in the cache (it can be cleared by the browser). */
export async function packInCache(pack = savedPack()): Promise<boolean> {
  if (!pack || !("caches" in globalThis)) return false;
  const cache = await caches.open(PACK_CACHE);
  return (await cache.match(pack.url, { ignoreVary: true })) !== undefined;
}

/** A newer manifest version than the one saved, or null. Needs signal; never throws. */
export async function packUpdate(configured = MAP_PACK_URL): Promise<PackManifest | null> {
  const saved = savedPack();
  if (!saved || !isManifestUrl(configured) || !navigator.onLine) return null;
  try {
    const m = await fetchManifest(configured);
    return m.version !== saved.version ? m : null;
  } catch {
    return null;
  }
}

export async function forgetPack(): Promise<void> {
  if ("caches" in globalThis) await caches.delete(PACK_CACHE);
  rememberPack(null);
}

const listeners = new Set<() => void>();

export type PackStatus =
  | { state: "none" } // no pack set up for this build
  | { state: "not-saved" }
  | { state: "missing"; pack: SavedPack } // saved before, but the browser cleared it
  | { state: "ready"; pack: SavedPack; update: PackManifest | null };

/** "Map ready" status for the Map Packs page and map screens. */
export function usePackStatus(): PackStatus {
  const [status, setStatus] = useState<PackStatus>(() => (MAP_PACK_URL ? { state: "not-saved" } : { state: "none" }));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  useEffect(() => {
    if (!MAP_PACK_URL) return;
    let live = true;
    const pack = savedPack();
    if (!pack) {
      setStatus({ state: "not-saved" });
      return;
    }
    void (async () => {
      const there = await packInCache(pack);
      if (!there) return live && setStatus({ state: "missing", pack });
      if (live) setStatus({ state: "ready", pack, update: null });
      const update = await packUpdate();
      if (live && update) setStatus({ state: "ready", pack, update });
    })();
    return () => {
      live = false;
    };
  }, [tick]);

  return status;
}
