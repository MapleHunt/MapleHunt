import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { DEFAULT_PARTY_RANGE, PartyRangeMonitor } from "@maplehunt/geo";
import type { LatLon, MemberState, RangeEvent } from "@maplehunt/geo";
import { requireSupabase } from "../lib/supabase";
import { useAppState } from "../state/AppState";
import { useAuthUser } from "./auth";
import { useGeo } from "./geo";
import { refreshParty, useParty } from "./party";
import type { Party } from "./party";
import { onHeard, startBroadcasting, stopBroadcasting, useRadio } from "./radio";

// Party positions over LoRa + the 5 km party-limit alert (T15) and lost contact (T16).
// Every phone runs its own PartyRangeMonitor on what it hears, so the alert shows on
// every phone in the party with no network.

export interface RosterEntry {
  nodeId: string;
  name: string;
  isYou: boolean;
}

export interface TrackedMember extends MemberState {
  name: string;
  isYou: boolean;
}

export interface PartyAlert {
  id: number;
  event: RangeEvent;
  text: string;
  warn: boolean;
  at: number;
}

const km = (d: number) => d.toFixed(1);

export function rangeAlertText(event: RangeEvent, name: string, isYou: boolean, tagHolderName: string): { text: string; warn: boolean } {
  const limit = DEFAULT_PARTY_RANGE.alertAboveKm;
  switch (event.type) {
    case "too_far":
      return isYou
        ? { text: `You are ${km(event.distanceKm)} km from ${tagHolderName}. Head back inside ${limit} km.`, warn: true }
        : { text: `${name} is ${km(event.distanceKm)} km from ${tagHolderName}. Party limit is ${limit} km.`, warn: true };
    case "back_in_range":
      return { text: isYou ? `You're back within ${limit} km.` : `${name} is back within ${limit} km.`, warn: false };
    case "lost_contact":
      return { text: `Lost contact with ${name}. Last heard ${Math.round(event.silentForMs / 60_000)} min ago.`, warn: true };
    case "contact_restored":
      return { text: `${name} is back on the radio.`, warn: false };
  }
}

/** Banner text for a member who is too far or lost right now. */
export function memberProblemText(m: TrackedMember, tagHolderName: string, now: number): string | null {
  if (m.status === "too_far" && m.distanceKm !== null) {
    return rangeAlertText({ type: "too_far", nodeId: m.nodeId, distanceKm: m.distanceKm }, m.name, m.isYou, tagHolderName).text;
  }
  if (m.status === "lost" && !m.isYou && m.lastHeardAt !== null) {
    return rangeAlertText({ type: "lost_contact", nodeId: m.nodeId, silentForMs: now - m.lastHeardAt }, m.name, false, tagHolderName).text;
  }
  return null;
}

export function ago(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))} s ago`;
  return `${Math.round(ms / 60_000)} min ago`;
}

/** Status line for a member row on the Party screen. */
export function radioLine(m: TrackedMember | undefined, now: number): string {
  if (!m) return "No radio paired";
  if (m.lastHeardAt === null) return m.isYou ? "Waiting for GPS" : "Not heard yet";
  const heard = ago(now - m.lastHeardAt);
  if (m.status === "lost") return `Lost contact · last heard ${heard}`;
  if (m.isTagHolder) return m.isYou ? "Sharing your position" : `Heard ${heard}`;
  const distance = m.distanceKm === null ? "" : `${m.distanceKm.toFixed(1)} km from tag holder · `;
  if (m.status === "too_far") return `Too far · ${distance}${heard}`;
  return m.isYou ? `${distance}sharing` : `${distance}${heard}`;
}

/** One party's monitor plus the names that go with each radio. */
export class PartyWatch {
  private readonly monitor: PartyRangeMonitor;
  private readonly roster = new Map<string, RosterEntry>();
  private nextId = 1;

  constructor(
    readonly tagHolderNode: string,
    readonly selfNode: string,
    roster: readonly RosterEntry[],
    reportIntervalMs: number = DEFAULT_PARTY_RANGE.reportIntervalMs,
    previous?: PartyWatch,
  ) {
    for (const r of roster) this.roster.set(r.nodeId, r);
    this.monitor = new PartyRangeMonitor(
      tagHolderNode,
      roster.map((r) => r.nodeId).filter((id) => id !== tagHolderNode),
      { reportIntervalMs },
    );
    // Keep what we already heard when the roster or interval changes.
    for (const m of previous?.members() ?? []) {
      if (m.position && m.lastHeardAt !== null) this.monitor.updatePosition(m.nodeId, m.position, m.lastHeardAt);
    }
  }

  nameOf(nodeId: string): string {
    return this.roster.get(nodeId)?.name ?? `Radio ${nodeId}`;
  }

  heard(nodeId: string, position: LatLon, at: number): PartyAlert[] {
    return this.toAlerts(this.monitor.updatePosition(nodeId, position, at), at);
  }

  tick(now: number): PartyAlert[] {
    return this.toAlerts(this.monitor.tick(now), now);
  }

  members(): TrackedMember[] {
    return this.monitor.getMembers().map((m) => ({ ...m, name: this.nameOf(m.nodeId), isYou: m.nodeId === this.selfNode }));
  }

  private toAlerts(events: RangeEvent[], at: number): PartyAlert[] {
    const tagHolderName = this.tagHolderNode === this.selfNode ? "you" : this.nameOf(this.tagHolderNode);
    return events
      // Your own phone going quiet means your GPS stopped, not that you're lost.
      .filter((e) => e.nodeId !== this.selfNode || (e.type !== "lost_contact" && e.type !== "contact_restored"))
      .map((event) => ({
        id: this.nextId++,
        event,
        at,
        ...rangeAlertText(event, this.nameOf(event.nodeId), event.nodeId === this.selfNode, tagHolderName),
      }));
  }
}

/** Radios we can name: every member who registered one, with this phone's radio as "you". */
export function buildRoster(party: Party, userId: string, selfNode: string): RosterEntry[] {
  const entries: RosterEntry[] = [{ nodeId: selfNode, name: "You", isYou: true }];
  for (const m of party.members) {
    if (m.profileId === userId || !m.meshNodeId || m.meshNodeId === selfNode) continue;
    entries.push({ nodeId: m.meshNodeId, name: m.name, isYou: false });
  }
  return entries;
}

export function tagHolderNodeOf(party: Party, userId: string, selfNode: string): string | null {
  if (party.tagHolderId === userId) return selfNode;
  return party.members.find((m) => m.profileId === party.tagHolderId)?.meshNodeId ?? null;
}

// ---------- store ----------

export interface PartyRangeState {
  members: TrackedMember[];
  /** Newest first. */
  alerts: PartyAlert[];
  /** Why the 5 km check isn't running, or null when it is. */
  notTracking: string | null;
}

let state: PartyRangeState = { members: [], alerts: [], notTracking: "Join a party to share positions." };
const listeners = new Set<() => void>();

function set(patch: Partial<PartyRangeState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function publish(watch: PartyWatch, alerts: PartyAlert[]) {
  if (alerts.length) {
    set({ alerts: [...alerts.reverse(), ...state.alerts].slice(0, 20) });
    if (alerts.some((a) => a.warn)) navigator.vibrate?.([500, 200, 500, 200, 500]);
  }
  set({ members: watch.members() });
}

export function usePartyRange(): PartyRangeState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

async function registerNode(partyId: string, nodeId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("set_mesh_node", { p_party: partyId, p_node: nodeId });
  if (error) throw error;
  await refreshParty();
}

const TICK_MS = 5_000;

function freshFix(timeout: number): Promise<{ lat: number; lon: number; fixAt: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, fixAt: p.timestamp }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout },
    );
  });
}

/** Runs the party radio loop for the whole app. Renders nothing. */
export function PartyTracker() {
  const user = useAuthUser();
  const { party } = useParty();
  const radio = useRadio();
  const { position } = useGeo();
  const { shareInterval } = useAppState();
  const intervalMs = Number.parseInt(shareInterval, 10) * 1000;
  const selfNode = radio.nodeId;
  const userId = user?.id ?? "";

  // Tell the party which radio this phone carries, so the others can name us.
  const me = party?.members.find((m) => m.profileId === userId);
  const needsRegister = party && me && selfNode && radio.connection === "connected" && navigator.onLine && me.meshNodeId !== selfNode;
  useEffect(() => {
    if (needsRegister) void registerNode(party.id, selfNode).catch(() => undefined);
  }, [needsRegister, party?.id, selfNode]);

  const tagHolderNode = party && selfNode ? tagHolderNodeOf(party, userId, selfNode) : null;
  const roster = useMemo(() => (party && selfNode ? buildRoster(party, userId, selfNode) : []), [party, userId, selfNode]);
  const rosterKey = roster.map((r) => `${r.nodeId}=${r.name}`).join("|");

  const watchRef = useRef<PartyWatch | null>(null);
  const watchParty = useRef<string | null>(null);
  useEffect(() => {
    if (!party) {
      watchRef.current = null;
      set({ members: [], notTracking: "Join a party to share positions." });
      return;
    }
    if (!selfNode) {
      watchRef.current = null;
      set({ members: [], notTracking: "Pair your radio to share positions." });
      return;
    }
    if (!tagHolderNode) {
      watchRef.current = null;
      set({ members: [], notTracking: "The tag holder hasn't paired a radio yet. They need signal once after pairing." });
      return;
    }
    const previous = watchParty.current === party.id ? (watchRef.current ?? undefined) : undefined;
    const watch = new PartyWatch(tagHolderNode, selfNode, roster, intervalMs, previous);
    watchRef.current = watch;
    watchParty.current = party.id;
    set({ members: watch.members(), notTracking: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?.id, selfNode, tagHolderNode, rosterKey, intervalMs]);

  useEffect(
    () =>
      onHeard((pos) => {
        const watch = watchRef.current;
        if (watch) publish(watch, watch.heard(pos.packet.nodeId, { lat: pos.packet.lat, lon: pos.packet.lon }, pos.receivedAt));
      }),
    [],
  );

  useEffect(() => {
    const watch = watchRef.current;
    if (watch && position) publish(watch, watch.heard(watch.selfNode, position, position.at));
  }, [position, tagHolderNode, rosterKey]);

  useEffect(() => {
    const id = setInterval(() => {
      const watch = watchRef.current;
      if (watch) publish(watch, watch.tick(Date.now()));
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Broadcast our own fix over LoRa while the radio is connected and we're in a party.
  const fixRef = useRef(position);
  fixRef.current = position;
  const broadcasting = Boolean(party) && radio.connection === "connected";
  useEffect(() => {
    if (!broadcasting) return;
    startBroadcasting(async () => {
      const fix = fixRef.current;
      if (fix && Date.now() - fix.at <= intervalMs) return { lat: fix.lat, lon: fix.lon, fixAt: fix.at };
      // Standing still, the GPS watch can go quiet; ask for a fresh fix rather than send nothing.
      return freshFix(Math.min(intervalMs, 20_000));
    }, intervalMs);
    return stopBroadcasting;
  }, [broadcasting, intervalMs]);

  return null;
}

export function dismissAlerts(): void {
  set({ alerts: [] });
}
