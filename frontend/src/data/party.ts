import { useEffect, useSyncExternalStore } from "react";
import type { Enums } from "@maplehunt/shared";
import { requireSupabase, supabase } from "../lib/supabase";
import { adoptInviteKey, clearPendingJoin, ensurePartyKey, inviteLink, normalizeCode, pendingJoin, queueJoin, saveInviteKey } from "./partyKey";

// The signed-in user's party (the most recently joined one), cached on the phone
// so the Party screen and hunt logging work offline.

export interface PartyMember {
  profileId: string;
  name: string;
  email: string;
  role: "tag_holder" | "member";
  joinedAt: string;
  meshNodeId: string | null;
}

export interface Party {
  id: string;
  name: string;
  species: Enums<"species_t">;
  wmuCode: string | null;
  seasonYear: number;
  joinCode: string;
  tagHolderId: string;
  members: PartyMember[];
  fetchedAt: string;
}

const KEY = "maplehunt.party";

interface PartyState {
  party: Party | null;
  loading: boolean;
  error: string | null;
}

function load(): Party | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Party) : null;
  } catch {
    return null;
  }
}

let state: PartyState = { party: load(), loading: false, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<PartyState>) {
  state = { ...state, ...patch };
  if ("party" in patch) {
    if (patch.party) localStorage.setItem(KEY, JSON.stringify(patch.party));
    else localStorage.removeItem(KEY);
  }
  listeners.forEach((l) => l());
}

async function fetchParty(partyId: string): Promise<Party> {
  const client = requireSupabase();
  const { data: p, error } = await client.from("parties").select("*").eq("id", partyId).single();
  if (error) throw error;
  const { data: rows, error: mErr } = await client
    .from("party_members")
    .select("profile_id, role, joined_at, mesh_node_id, profiles(display_name, email)")
    .eq("party_id", partyId)
    .order("joined_at");
  if (mErr) throw mErr;

  const members: PartyMember[] = (rows ?? []).map((r) => {
    const profile = r.profiles as { display_name: string | null; email: string | null } | null;
    const email = profile?.email ?? "";
    return {
      profileId: r.profile_id,
      name: profile?.display_name || email.split("@")[0] || "Member",
      email,
      role: r.role === "tag_holder" ? "tag_holder" : "member",
      joinedAt: r.joined_at,
      meshNodeId: r.mesh_node_id,
    };
  });
  // Tag holder first, then by join date.
  members.sort((a, b) => (a.role === b.role ? a.joinedAt.localeCompare(b.joinedAt) : a.role === "tag_holder" ? -1 : 1));

  return {
    id: p.id,
    name: p.name,
    species: p.species,
    wmuCode: p.wmu_code,
    seasonYear: p.season_year,
    joinCode: p.join_code,
    tagHolderId: p.tag_holder_id,
    members,
    fetchedAt: new Date().toISOString(),
  };
}

async function run<T>(task: () => Promise<T>): Promise<T> {
  set({ loading: true, error: null });
  try {
    return await task();
  } catch (err) {
    const message = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
    set({ error: message });
    throw err;
  } finally {
    set({ loading: false });
  }
}

let lastRefresh = 0;

/** Reload the party from Supabase. Keeps the cached copy when offline. */
export async function refreshParty(force = true): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  if (!force && Date.now() - lastRefresh < 20_000) return;
  lastRefresh = Date.now();
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return;
  await run(async () => {
    const { data, error } = await supabase!
      .from("party_members")
      .select("party_id, joined_at")
      .eq("profile_id", uid)
      .order("joined_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const partyId = data?.[0]?.party_id;
    set({ party: partyId ? await fetchParty(partyId) : null });
  });
}

export async function createParty(input: { name: string; species: Enums<"species_t">; seasonYear: number; wmuCode: string | null }): Promise<void> {
  await run(async () => {
    const client = requireSupabase();
    const { data, error } = await client.rpc("create_party", {
      p_name: input.name,
      p_species: input.species,
      p_season_year: input.seasonYear,
      ...(input.wmuCode ? { p_wmu_code: input.wmuCode } : {}),
    });
    let partyId = data?.id;
    if (error) {
      // Until migration 20261124190000 is applied, create_party always fails RLS
      // (it reads the new party back before the tag holder is a member). Doing it in
      // two steps, without reading back, passes the same rules.
      if (!/row-level security/i.test(error.message)) throw error;
      const uid = (await client.auth.getSession()).data.session?.user.id;
      if (!uid) throw new Error("Sign in to create a party.");
      partyId = crypto.randomUUID();
      const { error: pErr } = await client.from("parties").insert({
        id: partyId,
        name: input.name.trim(),
        tag_holder_id: uid,
        species: input.species,
        season_year: input.seasonYear,
        wmu_code: input.wmuCode,
      });
      if (pErr) throw pErr;
      const { error: mErr } = await client.from("party_members").insert({ party_id: partyId, profile_id: uid, role: "tag_holder" });
      if (mErr) throw mErr;
    }
    await ensurePartyKey(partyId!); // the radio channel key for this party
    set({ party: await fetchParty(partyId!) });
  });
}

/**
 * Join with a code (and the radio key from a scanned invite QR).
 * With no signal the key is kept and the join waits: "queued". It is sent when
 * the phone is back online (resumePendingJoin).
 */
export async function joinParty(code: string, key?: string | null): Promise<"joined" | "queued"> {
  const c = normalizeCode(code);
  if (key) await saveInviteKey(c, key);
  if (!navigator.onLine) {
    await queueJoin(c);
    return "queued";
  }
  return run(async () => {
    const { data, error } = await requireSupabase().rpc("join_party", { p_code: c });
    if (error) throw error;
    await adoptInviteKey(c, data);
    await clearPendingJoin();
    set({ party: await fetchParty(data) });
    return "joined" as const;
  });
}

let resuming = false;

/**
 * Sends a join that is waiting: scanned with no signal, or opened from an invite
 * link before signing in. Safe to call any time. Returns "joined" when it joined.
 */
export async function resumePendingJoin(): Promise<"joined" | null> {
  if (resuming || !supabase || !navigator.onLine) return null;
  const code = await pendingJoin();
  if (!code) return null;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  resuming = true;
  try {
    return (await joinParty(code)) === "joined" ? "joined" : null;
  } catch {
    // e.g. the code was changed meanwhile: the error shows on the Party screen.
    await clearPendingJoin();
    return null;
  } finally {
    resuming = false;
  }
}

if (typeof window !== "undefined") window.addEventListener("online", () => void resumePendingJoin());

export async function removeMember(partyId: string, profileId: string): Promise<void> {
  await run(async () => {
    const { error } = await requireSupabase().from("party_members").delete().eq("party_id", partyId).eq("profile_id", profileId);
    if (error) throw error;
    set({ party: await fetchParty(partyId) });
  });
}

export async function leaveParty(partyId: string, profileId: string): Promise<void> {
  await run(async () => {
    const { error } = await requireSupabase().from("party_members").delete().eq("party_id", partyId).eq("profile_id", profileId);
    if (error) throw error;
    set({ party: null });
  });
}

export async function rotateJoinCode(partyId: string): Promise<void> {
  await run(async () => {
    const { error } = await requireSupabase().rpc("rotate_join_code", { p_party: partyId });
    if (error) throw error;
    set({ party: await fetchParty(partyId) });
  });
}

export function useParty(): PartyState {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  useEffect(() => {
    void resumePendingJoin().then(() => refreshParty(false)).catch(() => undefined);
  }, []);
  return s;
}

/** Invite link; with the party key it also sets up the private radio channel. */
export function joinLink(code: string, key: string | null = null): string {
  return inviteLink(code, key);
}
