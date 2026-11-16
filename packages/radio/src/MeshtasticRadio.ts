import { decodePosition, encodePosition, POSITION_PAYLOAD_BYTES } from "./positionCodec";
import {
  RadioNotConnectedError,
  type ConnectionListener,
  type PositionListener,
  type RadioConnection,
  type RadioService,
  type Unsubscribe,
} from "./RadioService";

/** Meshtastic port for app-defined payloads; firmware relays it like any other packet. */
export const PRIVATE_APP_PORT = 256;

/** The parts of a received Meshtastic MeshPacket that the radio layer needs. */
export interface MeshPacketIn {
  from: number;
  channel: number;
  portnum: number;
  payload: Uint8Array;
  hopStart?: number;
  hopLimit?: number;
  rxSnr?: number;
}

/** A configured connection to one radio. `webBluetoothOpener` makes the real one. */
export interface MeshLink {
  readonly nodeNum: number;
  send(payload: Uint8Array, channel: number): Promise<void>;
  onPacket(listener: (packet: MeshPacketIn) => void): Unsubscribe;
  /** Fires when the link drops without `close()` being called. */
  onDrop(listener: () => void): Unsubscribe;
  close(): Promise<void>;
}

/**
 * Opens a link. `reconnect` is false when the user tapped "Pair" (the browser
 * may show its device chooser) and true for automatic retries, which must reuse
 * the radio picked earlier because the chooser needs a tap.
 */
export type LinkOpener = (reconnect: boolean) => Promise<MeshLink>;

export interface WakeLockLike {
  acquire(): Promise<void>;
  release(): Promise<void>;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface MeshtasticRadioOptions {
  /** Channel index of the party channel on the radio. Default 0. */
  channel?: number;
  /** Delays between reconnect attempts; the last one repeats. */
  retryDelaysMs?: number[];
  wakeLock?: WakeLockLike;
  timers?: Timers;
  now?: () => number;
  /** Called when a reconnect attempt fails. */
  onError?: (err: unknown) => void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function nodeIdFromNum(num: number): string {
  return `!${(num >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * The real party radio: a Heltec V3 running Meshtastic, reached over Web
 * Bluetooth. Bluetooth drops when the phone screen turns off or the radio
 * goes out of reach, so a drop the user didn't ask for keeps retrying with
 * backoff until it reconnects or the user disconnects. The screen wake lock is
 * held while the radio is in use to make those drops rarer.
 */
export class MeshtasticRadio implements RadioService {
  private connection: RadioConnection = "disconnected";
  private link: MeshLink | null = null;
  private unsubscribeLink: Unsubscribe[] = [];
  private nodeNum: number | null = null;
  private seq = 0;
  private wanted = false;
  private attempt = 0;
  private retryHandle: unknown = null;
  private readonly lastSeq = new Map<string, number>();
  private readonly positionListeners = new Set<PositionListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly channel: number;
  private readonly retryDelaysMs: number[];
  private readonly timers: Timers;
  private readonly now: () => number;
  private readonly onError: (err: unknown) => void;

  constructor(
    private readonly openLink: LinkOpener,
    private readonly options: MeshtasticRadioOptions = {},
  ) {
    this.channel = options.channel ?? 0;
    this.retryDelaysMs = options.retryDelaysMs ?? [1_000, 2_000, 5_000, 10_000, 30_000];
    this.timers = options.timers ?? realTimers;
    this.now = options.now ?? Date.now;
    this.onError = options.onError ?? (() => {});
  }

  /** `!` + the radio's node number in hex, like the Meshtastic app. Empty until first connected. */
  get nodeId(): string {
    return this.nodeNum === null ? "" : nodeIdFromNum(this.nodeNum);
  }

  getConnection(): RadioConnection {
    return this.connection;
  }

  /** Pair and connect. Rejects if the user cancels the chooser or the radio can't be reached. */
  async connect(): Promise<void> {
    if (this.connection !== "disconnected") return;
    this.wanted = true;
    this.setConnection("connecting");
    try {
      this.attach(await this.openLink(false));
    } catch (err) {
      this.wanted = false;
      this.setConnection("disconnected");
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.wanted = false;
    this.cancelRetry();
    const link = this.link;
    this.detach();
    this.setConnection("disconnected");
    await this.options.wakeLock?.release();
    await link?.close();
  }

  async sendPosition(fix: { lat: number; lon: number; fixAt: number }): Promise<void> {
    if (this.connection !== "connected" || !this.link) throw new RadioNotConnectedError();
    const payload = encodePosition({ ...fix, seq: this.seq });
    this.seq = (this.seq + 1) & 0xffff;
    await this.link.send(payload, this.channel);
  }

  onPosition(listener: PositionListener): Unsubscribe {
    this.positionListeners.add(listener);
    return () => this.positionListeners.delete(listener);
  }

  onConnectionChange(listener: ConnectionListener): Unsubscribe {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private attach(link: MeshLink): void {
    if (!this.wanted) {
      void link.close();
      return;
    }
    this.link = link;
    this.nodeNum = link.nodeNum;
    this.attempt = 0;
    this.unsubscribeLink = [link.onPacket((p) => this.receive(p)), link.onDrop(() => this.dropped())];
    this.setConnection("connected");
    void this.options.wakeLock?.acquire().catch(this.onError);
  }

  private detach(): void {
    for (const unsubscribe of this.unsubscribeLink) unsubscribe();
    this.unsubscribeLink = [];
    this.link = null;
  }

  private dropped(): void {
    this.detach();
    if (!this.wanted) return;
    this.setConnection("connecting");
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    const delay = this.retryDelaysMs[Math.min(this.attempt, this.retryDelaysMs.length - 1)] ?? 30_000;
    this.attempt++;
    this.retryHandle = this.timers.setTimeout(() => {
      this.retryHandle = null;
      void this.retry();
    }, delay);
  }

  private async retry(): Promise<void> {
    if (!this.wanted) return;
    try {
      this.attach(await this.openLink(true));
    } catch (err) {
      this.onError(err);
      if (this.wanted) this.scheduleRetry();
    }
  }

  private cancelRetry(): void {
    if (this.retryHandle !== null) this.timers.clearTimeout(this.retryHandle);
    this.retryHandle = null;
  }

  private receive(packet: MeshPacketIn): void {
    if (packet.portnum !== PRIVATE_APP_PORT || packet.channel !== this.channel) return;
    if (packet.from === this.nodeNum || packet.payload.length !== POSITION_PAYLOAD_BYTES) return;

    let position;
    try {
      position = decodePosition(packet.payload);
    } catch {
      return;
    }
    const nodeId = nodeIdFromNum(packet.from);
    if (this.lastSeq.get(nodeId) === position.seq) return;
    this.lastSeq.set(nodeId, position.seq);

    // hopStart is the hop limit the sender used; firmware older than 2.3 leaves it at 0.
    const hops = packet.hopStart && packet.hopLimit !== undefined ? packet.hopStart - packet.hopLimit + 1 : 1;
    const received = {
      packet: { nodeId, ...position },
      receivedAt: this.now(),
      hops,
      ...(packet.rxSnr !== undefined && packet.rxSnr !== 0 ? { snr: packet.rxSnr } : {}),
    };
    for (const listener of this.positionListeners) listener(received);
  }

  private setConnection(state: RadioConnection): void {
    if (state === this.connection) return;
    this.connection = state;
    for (const listener of this.connectionListeners) listener(state);
  }
}
