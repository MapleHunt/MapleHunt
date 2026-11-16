/**
 * The one interface the app uses to talk to the party radio.
 *
 * Two implementations:
 * - `MockRadio` (this package): an in-memory mesh, so every screen can be
 *   built and tested before the Heltec V3 radios are set up.
 * - `MeshtasticRadio`: Web Bluetooth + `@meshtastic/core` to a real
 *   Heltec WiFi LoRa 32 V3 on 915 MHz. Android + Chrome only.
 *
 * Design decision: the app sends positions itself instead of using the
 * firmware's position broadcast. The firmware re-stamps a stored position
 * when it rebroadcasts, so a dead phone would still look "fresh". With the
 * app sending, a silent phone shows up as lost contact, never a stale "fine".
 */

export type RadioConnection = "disconnected" | "connecting" | "connected";

/** A position as it travels over LoRa. `fixAt` is when the phone's GPS took the fix. */
export interface PositionPacket {
  nodeId: string;
  lat: number;
  lon: number;
  /** Epoch ms of the GPS fix (sent with 1 s precision). */
  fixAt: number;
  /** Rolling 0–65535 counter per sender, to spot duplicates from relays. */
  seq: number;
}

export interface ReceivedPosition {
  packet: PositionPacket;
  /** Epoch ms when this phone received it. */
  receivedAt: number;
  /** 1 = heard directly, 2+ = relayed by other party radios. */
  hops: number;
  /** Signal-to-noise ratio in dB, if the radio reports it. */
  snr?: number;
}

export type PositionListener = (pos: ReceivedPosition) => void;
export type ConnectionListener = (state: RadioConnection) => void;
export type Unsubscribe = () => void;

export interface RadioService {
  /** This radio's mesh node id. */
  readonly nodeId: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnection(): RadioConnection;
  /** Broadcast our position to the party channel. Throws if not connected. */
  sendPosition(fix: { lat: number; lon: number; fixAt: number }): Promise<void>;
  onPosition(listener: PositionListener): Unsubscribe;
  onConnectionChange(listener: ConnectionListener): Unsubscribe;
}

export class RadioNotConnectedError extends Error {
  constructor() {
    super("Radio is not connected");
    this.name = "RadioNotConnectedError";
  }
}
