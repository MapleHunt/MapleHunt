import { describe, expect, it } from "vitest";
import { POSITION_PAYLOAD_BYTES, decodePosition, encodePosition } from "../src/positionCodec";

describe("position codec", () => {
  it("round-trips a position at full precision", () => {
    const fixAt = Date.UTC(2026, 10, 8, 7, 42, 0);
    const bytes = encodePosition({ lat: 45.3121234, lon: -78.1047123, fixAt, seq: 513 });
    expect(bytes).toHaveLength(POSITION_PAYLOAD_BYTES);
    const p = decodePosition(bytes);
    expect(p.lat).toBeCloseTo(45.3121234, 7);
    expect(p.lon).toBeCloseTo(-78.1047123, 7);
    expect(p.fixAt).toBe(fixAt);
    expect(p.seq).toBe(513);
  });

  it("rejects bad input", () => {
    expect(() => encodePosition({ lat: 95, lon: 0, fixAt: 0, seq: 0 })).toThrow(RangeError);
    expect(() => encodePosition({ lat: 0, lon: 0, fixAt: 0, seq: 70_000 })).toThrow(RangeError);
    expect(() => decodePosition(new Uint8Array(3))).toThrow(RangeError);
  });

  it("rejects an unknown format version", () => {
    const bytes = encodePosition({ lat: 1, lon: 1, fixAt: 0, seq: 0 });
    bytes[0] = 9;
    expect(() => decodePosition(bytes)).toThrow(/format/);
  });
});
