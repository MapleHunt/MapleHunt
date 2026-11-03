import { describe, expect, it } from "vitest";
import { assertValidPoint, distanceKm } from "../src/distance";
import { CAMP, north } from "./helpers";

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm(CAMP, CAMP)).toBe(0);
  });

  it("matches a known distance (Toronto to Ottawa ≈ 352 km)", () => {
    const toronto = { lat: 43.6532, lon: -79.3832 };
    const ottawa = { lat: 45.4215, lon: -75.6972 };
    expect(distanceKm(toronto, ottawa)).toBeCloseTo(352, -1);
  });

  it("measures 5.3 km north correctly", () => {
    expect(distanceKm(CAMP, north(CAMP, 5.3))).toBeCloseTo(5.3, 3);
  });

  it("is symmetric", () => {
    const b = { lat: 45.35, lon: -78.05 };
    expect(distanceKm(CAMP, b)).toBeCloseTo(distanceKm(b, CAMP), 9);
  });
});

describe("assertValidPoint", () => {
  it("rejects impossible coordinates", () => {
    expect(() => assertValidPoint({ lat: 91, lon: 0 })).toThrow(RangeError);
    expect(() => assertValidPoint({ lat: 0, lon: Number.NaN })).toThrow(RangeError);
  });
});
