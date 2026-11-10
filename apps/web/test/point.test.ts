import { describe, expect, it } from "vitest";
import { parsePointText, toPointText } from "../src/db/point";

describe("point text", () => {
  it("writes longitude first", () => {
    expect(toPointText({ lat: 43.351, lon: -80.126 })).toBe("SRID=4326;POINT(-80.126 43.351)");
  });

  it("reads what sync_pull returns", () => {
    expect(parsePointText("SRID=4326;POINT(-80.126 43.351)")).toEqual({ lat: 43.351, lon: -80.126 });
  });

  it("returns null for a missing location", () => {
    expect(parsePointText(null)).toBeNull();
    expect(parsePointText("garbage")).toBeNull();
  });
});
