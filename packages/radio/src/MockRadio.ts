import { decodePosition, encodePosition } from "./positionCodec";
import {
  RadioNotConnectedError,
  type ConnectionListener,
  type PositionListener,
  type RadioConnection,
  type RadioService,
  type Unsubscribe,
} from "./RadioService";

export interface MockMeshOptions {
  /** Max hops a packet may take, like Meshtastic's hop limit. Default 3. */
  hopLimit?: number;
  /** Delay before delivery, in ms. 0 (default) delivers synchronously, which keeps tests simple. */
  latencyMs?: number;
  /** Clock used for `receivedAt`. Default `Date.now`. */
  now?: () => number;
}

/**
 * An in-memory stand-in for the LoRa mesh. Radios on the same mesh hear each
 * other unless a link is cut with `setLink(a, b, false)`; cut links are routed
 * around through other radios (relaying), up to the hop limit.
 */
export class MockMesh {
  private readonly radios = new Map<string, MockRadio>();
  private readonly cut = new Set<string>();
  readonly hopLimit: number;
  readonly latencyMs: number;
  readonly now: () => number;

  constructor(options: MockMeshOptions = {}) {
    this.hopLimit = options.hopLimit ?? 3;
    this.latencyMs = options.latencyMs ?? 0;
    this.now = options.now ?? Date.now;
  }

  /** Create a radio on this mesh. */
  addRadio(nodeId: string): MockRadio {
    if (this.radios.has(nodeId)) throw new Error(`Radio ${nodeId} already exists`);
    const radio = new MockRadio(nodeId, this);
    this.radios.set(nodeId, radio);
    return radio;
  }

  /** Simulate two radios being in or out of direct range of each other. */
  setLink(a: string, b: string, up: boolean): void {
    const key = linkKey(a, b);
    if (up) this.cut.delete(key);
    else this.cut.add(key);
  }

  canHearDirectly(a: string, b: string): boolean {
    return a !== b && !this.cut.has(linkKey(a, b));
  }

  /** @internal Called by MockRadio.sendPosition. */
  broadcast(from: string, payload: Uint8Array): void {
    const hopsTo = this.route(from);
    for (const [nodeId, hops] of hopsTo) {
      const radio = this.radios.get(nodeId);
      if (!radio || nodeId === from) continue;
      const deliver = () => radio.receive(from, payload, hops, this.now());
      if (this.latencyMs > 0) setTimeout(deliver, this.latencyMs * hops);
      else deliver();
    }
  }

  /** Fewest hops from `from` to every connected radio it can reach (BFS over connected radios). */
  private route(from: string): Map<string, number> {
    const hops = new Map<string, number>([[from, 0]]);
    let frontier = [from];
    for (let hop = 1; hop <= this.hopLimit && frontier.length > 0; hop++) {
      const next: string[] = [];
      for (const a of frontier) {
        for (const [b, radio] of this.radios) {
          if (hops.has(b) || radio.getConnection() !== "connected" || !this.canHearDirectly(a, b)) continue;
          hops.set(b, hop);
          next.push(b);
        }
      }
      frontier = next;
    }
    return hops;
  }
}

function linkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** A fake party radio. Behaves like the real one from the app's point of view. */
export class MockRadio implements RadioService {
  private connection: RadioConnection = "disconnected";
  private seq = 0;
  private readonly positionListeners = new Set<PositionListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  /** Last seq seen per sender, so a packet that arrives twice is shown once. */
  private readonly lastSeq = new Map<string, number>();

  constructor(
    readonly nodeId: string,
    private readonly mesh: MockMesh,
  ) {}

  async connect(): Promise<void> {
    if (this.connection === "connected") return;
    this.setConnection("connecting");
    this.setConnection("connected");
  }

  async disconnect(): Promise<void> {
    this.setConnection("disconnected");
  }

  getConnection(): RadioConnection {
    return this.connection;
  }

  async sendPosition(fix: { lat: number; lon: number; fixAt: number }): Promise<void> {
    if (this.connection !== "connected") throw new RadioNotConnectedError();
    const payload = encodePosition({ ...fix, seq: this.seq });
    this.seq = (this.seq + 1) & 0xffff;
    this.mesh.broadcast(this.nodeId, payload);
  }

  onPosition(listener: PositionListener): Unsubscribe {
    this.positionListeners.add(listener);
    return () => this.positionListeners.delete(listener);
  }

  onConnectionChange(listener: ConnectionListener): Unsubscribe {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  /** @internal Called by MockMesh. */
  receive(from: string, payload: Uint8Array, hops: number, receivedAt: number): void {
    if (this.connection !== "connected") return;
    const p = decodePosition(payload);
    if (this.lastSeq.get(from) === p.seq) return;
    this.lastSeq.set(from, p.seq);
    const packet = { nodeId: from, lat: p.lat, lon: p.lon, fixAt: p.fixAt, seq: p.seq };
    for (const l of this.positionListeners) l({ packet, receivedAt, hops });
  }

  private setConnection(state: RadioConnection): void {
    this.connection = state;
    for (const l of this.connectionListeners) l(state);
  }
}
