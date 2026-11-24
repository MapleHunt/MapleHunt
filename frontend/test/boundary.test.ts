import { describe, expect, it } from "vitest";
import { crossingText } from "../src/data/geo";

const park = { id: 2, name: "Algonquin Park", category: "park" as const };

describe("crossingText", () => {
  it("warns when you walk onto closed land", () => {
    expect(crossingText({ type: "land_changed", from: "crown", to: "closed", area: park }, null)).toEqual({
      text: "You entered Algonquin Park. No hunting here.",
      warn: true,
    });
  });

  it("does not warn when you leave closed land", () => {
    const c = crossingText({ type: "land_changed", from: "closed", to: "check", area: null }, null);
    expect(c.warn).toBe(false);
    expect(c.text).toBe("You left the closed area. Check access.");
  });

  it("warns when you leave your party's WMU", () => {
    expect(crossingText({ type: "wmu_changed", from: "87D", to: "87C" }, "87D").warn).toBe(true);
    expect(crossingText({ type: "wmu_changed", from: "87C", to: "87D" }, "87D").warn).toBe(false);
  });

  it("only informs on a WMU crossing with no party WMU", () => {
    expect(crossingText({ type: "wmu_changed", from: "87D", to: "87C" }, null)).toEqual({ text: "You crossed into WMU 87C.", warn: false });
  });

  it("warns when you walk off the loaded WMU data", () => {
    expect(crossingText({ type: "wmu_changed", from: "87D", to: null }, null).warn).toBe(true);
  });
});
