/**
 * Compact binary format for a position on the private party channel.
 *
 *   byte 0       format version (1)
 *   bytes 1–4    latitude  × 1e7, int32  (≈1 cm precision — full precision,
 *                not the channel default of 0, which sends nothing)
 *   bytes 5–8    longitude × 1e7, int32
 *   bytes 9–12   fix time, uint32 seconds since epoch
 *   bytes 13–14  sequence number, uint16
 *
 * 15 bytes total, well inside a single LoRa packet. The sender's node id is
 * not in the payload: the mesh header already carries it.
 */

export const POSITION_FORMAT_VERSION = 1;
export const POSITION_PAYLOAD_BYTES = 15;

export interface EncodablePosition {
  lat: number;
  lon: number;
  fixAt: number;
  seq: number;
}

export function encodePosition(p: EncodablePosition): Uint8Array {
  if (!Number.isFinite(p.lat) || Math.abs(p.lat) > 90) throw new RangeError(`Invalid latitude: ${p.lat}`);
  if (!Number.isFinite(p.lon) || Math.abs(p.lon) > 180) throw new RangeError(`Invalid longitude: ${p.lon}`);
  if (!Number.isInteger(p.seq) || p.seq < 0 || p.seq > 0xffff) throw new RangeError(`Invalid seq: ${p.seq}`);
  const buf = new Uint8Array(POSITION_PAYLOAD_BYTES);
  const view = new DataView(buf.buffer);
  view.setUint8(0, POSITION_FORMAT_VERSION);
  view.setInt32(1, Math.round(p.lat * 1e7));
  view.setInt32(5, Math.round(p.lon * 1e7));
  view.setUint32(9, Math.floor(p.fixAt / 1000));
  view.setUint16(13, p.seq);
  return buf;
}

export function decodePosition(bytes: Uint8Array): EncodablePosition {
  if (bytes.length !== POSITION_PAYLOAD_BYTES) {
    throw new RangeError(`Expected ${POSITION_PAYLOAD_BYTES} bytes, got ${bytes.length}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== POSITION_FORMAT_VERSION) throw new RangeError(`Unknown position format v${version}`);
  return {
    lat: view.getInt32(1) / 1e7,
    lon: view.getInt32(5) / 1e7,
    fixAt: view.getUint32(9) * 1000,
    seq: view.getUint16(13),
  };
}
