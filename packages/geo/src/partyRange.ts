import { assertValidPoint, distanceKm, type LatLon } from "./distance";

/**
 * Thresholds from the R&R (FR-08, FR-09):
 * - alert when a member is more than 5.0 km from the tag holder
 * - clear only once they are back under 4.8 km, so the alert never flickers
 * - "lost contact" when a member is silent for 3x the report interval (180 s)
 */
export interface PartyRangeConfig {
  alertAboveKm: number;
  clearBelowKm: number;
  reportIntervalMs: number;
  lostAfterIntervals: number;
}

export const DEFAULT_PARTY_RANGE: PartyRangeConfig = {
  alertAboveKm: 5.0,
  clearBelowKm: 4.8,
  reportIntervalMs: 60_000,
  lostAfterIntervals: 3,
};

export type MemberStatus = "unknown" | "ok" | "too_far" | "lost";

export interface MemberState {
  nodeId: string;
  isTagHolder: boolean;
  status: MemberStatus;
  /** Distance to the tag holder in km, or null if either position is unknown. */
  distanceKm: number | null;
  position: LatLon | null;
  /** Epoch ms of the last packet heard from this member, or null if never heard. */
  lastHeardAt: number | null;
}

export type RangeEvent =
  | { type: "too_far"; nodeId: string; distanceKm: number }
  | { type: "back_in_range"; nodeId: string; distanceKm: number }
  | { type: "lost_contact"; nodeId: string; silentForMs: number }
  | { type: "contact_restored"; nodeId: string };

interface Member {
  nodeId: string;
  position: LatLon | null;
  lastHeardAt: number | null;
  tooFar: boolean;
  lost: boolean;
}

/**
 * Tracks every party member against the tag holder and raises the 5 km and
 * lost-contact alerts. Runs entirely on the phone: feed it every position
 * heard over LoRa (including your own) and call `tick()` on a timer.
 *
 * Every phone in the party runs its own monitor, so every member sees the
 * alert, including the member who walked too far.
 */
export class PartyRangeMonitor {
  private readonly config: PartyRangeConfig;
  private readonly members = new Map<string, Member>();

  constructor(
    private readonly tagHolderId: string,
    memberIds: readonly string[] = [],
    config: Partial<PartyRangeConfig> = {},
  ) {
    this.config = { ...DEFAULT_PARTY_RANGE, ...config };
    if (this.config.clearBelowKm >= this.config.alertAboveKm) {
      throw new RangeError("clearBelowKm must be smaller than alertAboveKm");
    }
    for (const id of [tagHolderId, ...memberIds]) this.ensureMember(id);
  }

  /** Silence (ms) after which a member counts as lost: 3 x 60 s = 180 s by default. */
  get lostAfterMs(): number {
    return this.config.reportIntervalMs * this.config.lostAfterIntervals;
  }

  /** Record a position heard for `nodeId` at `heardAt` (epoch ms). Returns any new alerts. */
  updatePosition(nodeId: string, position: LatLon, heardAt: number): RangeEvent[] {
    assertValidPoint(position);
    const m = this.ensureMember(nodeId);
    if (m.lastHeardAt !== null && heardAt < m.lastHeardAt) return []; // stale or replayed packet
    const events: RangeEvent[] = [];
    m.position = position;
    m.lastHeardAt = heardAt;
    if (m.lost) {
      m.lost = false;
      events.push({ type: "contact_restored", nodeId });
    }
    // If the tag holder moved, everyone's distance changes; otherwise only this member's.
    const toCheck = nodeId === this.tagHolderId ? [...this.members.values()] : [m];
    for (const member of toCheck) events.push(...this.checkDistance(member));
    return events;
  }

  /** Check for members who have gone silent. Call this every few seconds. */
  tick(now: number): RangeEvent[] {
    const events: RangeEvent[] = [];
    for (const m of this.members.values()) {
      if (m.lost || m.lastHeardAt === null) continue;
      const silentForMs = now - m.lastHeardAt;
      if (silentForMs > this.lostAfterMs) {
        m.lost = true;
        events.push({ type: "lost_contact", nodeId: m.nodeId, silentForMs });
      }
    }
    return events;
  }

  getMembers(): MemberState[] {
    return [...this.members.values()].map((m) => this.toState(m));
  }

  getMember(nodeId: string): MemberState | undefined {
    const m = this.members.get(nodeId);
    return m ? this.toState(m) : undefined;
  }

  private ensureMember(nodeId: string): Member {
    let m = this.members.get(nodeId);
    if (!m) {
      m = { nodeId, position: null, lastHeardAt: null, tooFar: false, lost: false };
      this.members.set(nodeId, m);
    }
    return m;
  }

  private distanceOf(m: Member): number | null {
    const holder = this.members.get(this.tagHolderId);
    if (!holder?.position || !m.position) return null;
    return distanceKm(holder.position, m.position);
  }

  private checkDistance(m: Member): RangeEvent[] {
    if (m.nodeId === this.tagHolderId) return [];
    const d = this.distanceOf(m);
    if (d === null) return [];
    if (!m.tooFar && d > this.config.alertAboveKm) {
      m.tooFar = true;
      return [{ type: "too_far", nodeId: m.nodeId, distanceKm: d }];
    }
    if (m.tooFar && d < this.config.clearBelowKm) {
      m.tooFar = false;
      return [{ type: "back_in_range", nodeId: m.nodeId, distanceKm: d }];
    }
    return [];
  }

  private toState(m: Member): MemberState {
    let status: MemberStatus;
    if (m.lost) status = "lost";
    else if (m.lastHeardAt === null) status = "unknown";
    else if (m.tooFar) status = "too_far";
    else status = "ok";
    return {
      nodeId: m.nodeId,
      isTagHolder: m.nodeId === this.tagHolderId,
      status,
      distanceKm: m.nodeId === this.tagHolderId ? (m.position ? 0 : null) : this.distanceOf(m),
      position: m.position,
      lastHeardAt: m.lastHeardAt,
    };
  }
}
