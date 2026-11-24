import { useEffect, useState } from "react";
import { kvGet, kvSet } from "./db";

// T14 · The party's private radio channel key (AES-256, 32 random bytes).
//
// The tag holder's phone makes it when the party is created. It travels only
// inside the invite QR, in the link's #fragment (browsers never send the
// fragment to a server), so it is shared in person and needs no signal.
// It is kept on each phone and never stored in Supabase. The radio uses it as
// the party channel's PSK (partyKeyBytes).
//
// Joining by QR works offline too: the key is saved straight away and the
// join itself (parties / party_members) is sent when the phone has signal.

const KEY_BYTES = 32;
const byParty = (partyId: string) => `partyKey:${partyId}`;
const byCode = (code: string) => `partyKey:code:${normalizeCode(code)}`;
const PENDING_JOIN = "pendingJoin";

export const normalizeCode = (code: string) => code.trim().toUpperCase();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** A new random AES-256 key, as 43 URL-safe characters. */
export function newPartyKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

export function isPartyKey(key: string | null | undefined): key is string {
  return !!key && fromBase64Url(key)?.length === KEY_BYTES;
}

/** The 32 key bytes, for the radio's channel PSK. */
export function partyKeyBytes(key: string): Uint8Array {
  const bytes = fromBase64Url(key);
  if (!bytes || bytes.length !== KEY_BYTES) throw new Error("Not a party key.");
  return bytes;
}

/** Reads the key from an invite link's fragment ("#k=…"). */
export function keyFromHash(hash: string): string | null {
  const k = new URLSearchParams(hash.replace(/^#/, "")).get("k");
  return isPartyKey(k) ? k : null;
}

/** The invite link: /join/<code>#k=<key>. The key part stays on the phones. */
export function inviteLink(code: string, key: string | null): string {
  const base = `${location.origin}/join/${encodeURIComponent(normalizeCode(code))}`;
  return key ? `${base}#k=${key}` : base;
}

export interface Invite {
  code: string;
  key: string | null;
}

/**
 * Reads an invite from QR text or a pasted link (any host: a QR made on a laptop
 * still works when scanned in the app), or from a bare join code like "MH-ABC123".
 */
export function parseInvite(text: string): Invite | null {
  const t = text.trim();
  if (/^MH-[A-Z0-9]{4,12}$/i.test(t)) return { code: normalizeCode(t), key: null };
  try {
    const url = new URL(t);
    const m = url.pathname.match(/\/join\/([^/]+)\/?$/);
    if (!m) return null;
    const code = normalizeCode(decodeURIComponent(m[1]!));
    if (!/^MH-[A-Z0-9]{4,12}$/.test(code)) return null;
    return { code, key: keyFromHash(url.hash) };
  } catch {
    return null;
  }
}

let captured: Promise<string | null> = Promise.resolve(null);

/**
 * Call once at start-up. If the app was opened from an invite link, keep the
 * code and key on this phone straight away, so the join survives signing in
 * (Google sign-in drops the #key; an email confirmation link goes to the home page).
 * The key is also taken out of the address bar.
 */
export function captureInviteFromUrl(loc: Location = window.location): void {
  const invite = parseInvite(loc.href);
  if (!invite) return;
  if (loc.hash) history.replaceState(history.state, "", loc.pathname + loc.search);
  captured = (async () => {
    if (invite.key) await saveInviteKey(invite.code, invite.key);
    await queueJoin(invite.code);
    return invite.code;
  })().catch(() => null);
}

/** Resolves once an invite from the start-up URL has been saved. */
export function inviteCaptured(): Promise<string | null> {
  return captured;
}

export async function getPartyKey(partyId: string): Promise<string | null> {
  const k = await kvGet<string>(byParty(partyId));
  return isPartyKey(k) ? k : null;
}

/** Tag holder: the party's key, made on first use. */
export async function ensurePartyKey(partyId: string): Promise<string> {
  const existing = await getPartyKey(partyId);
  if (existing) return existing;
  const key = newPartyKey();
  await kvSet(byParty(partyId), key);
  return key;
}

/** Member: keep the key from a scanned invite until the join is confirmed. */
export async function saveInviteKey(code: string, key: string): Promise<void> {
  if (!isPartyKey(key)) throw new Error("Not a party key.");
  await kvSet(byCode(code), key);
}

/** After joining: file the invite's key under the party it belongs to. */
export async function adoptInviteKey(code: string, partyId: string): Promise<string | null> {
  const key = await kvGet<string>(byCode(code));
  if (!isPartyKey(key)) return null;
  await kvSet(byParty(partyId), key);
  return key;
}

export async function queueJoin(code: string): Promise<void> {
  await kvSet(PENDING_JOIN, normalizeCode(code));
}

export async function pendingJoin(): Promise<string | null> {
  return (await kvGet<string>(PENDING_JOIN)) ?? null;
}

export async function clearPendingJoin(): Promise<void> {
  await kvSet(PENDING_JOIN, null);
}

/**
 * The key to put in this party's invite QR: the tag holder makes one if needed;
 * a member shares the one they were given (or none, if they joined by typing the code).
 */
export function useInviteKey(partyId: string | undefined, isTagHolder: boolean): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    if (!partyId) return setKey(null);
    let alive = true;
    void (isTagHolder ? ensurePartyKey(partyId) : getPartyKey(partyId)).then((k) => alive && setKey(k));
    return () => {
      alive = false;
    };
  }, [partyId, isTagHolder]);
  return key;
}
