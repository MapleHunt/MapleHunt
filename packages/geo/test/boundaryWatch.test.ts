import { describe, expect, it } from "vitest";
import { BoundaryWatcher } from "../src/boundaryWatch";
import type { LandAdvice, PositionCheck } from "../src/landCheck";

const crown: LandAdvice = { status: "crown", message: "", area: { id: 1, category: "crown" } };
const crown2: LandAdvice = { status: "crown", message: "", area: { id: 4, category: "crown" } };
const park: LandAdvice = { status: "closed", message: "", area: { id: 2, name: "Park", category: "park" } };
const check: LandAdvice = { status: "check", message: "", area: null };

const at = (wmuCode: string | null, land: LandAdvice): PositionCheck => ({ wmuCode, land });

describe("BoundaryWatcher", () => {
  it("does not announce the starting position", () => {
    const w = new BoundaryWatcher();
    expect(w.update(at("87D", park))).toEqual([]);
    expect(w.current).toEqual(at("87D", park));
  });

  it("announces a WMU crossing after two fixes agree", () => {
    const w = new BoundaryWatcher();
    w.update(at("87D", crown));
    expect(w.update(at("87C", crown))).toEqual([]);
    expect(w.update(at("87C", crown))).toEqual([{ type: "wmu_changed", from: "87D", to: "87C" }]);
    expect(w.update(at("87C", crown))).toEqual([]);
  });

  it("ignores a single jittery fix across the line", () => {
    const w = new BoundaryWatcher();
    w.update(at("87D", crown));
    for (let i = 0; i < 5; i++) {
      expect(w.update(at("87C", crown))).toEqual([]);
      expect(w.update(at("87D", crown))).toEqual([]);
    }
    expect(w.current?.wmuCode).toBe("87D");
  });

  it("announces walking onto closed land and back off it", () => {
    const w = new BoundaryWatcher();
    w.update(at("87D", crown));
    w.update(at("87D", park));
    expect(w.update(at("87D", park))).toEqual([{ type: "land_changed", from: "crown", to: "closed", area: park.area }]);
    w.update(at("87D", check));
    expect(w.update(at("87D", check))).toEqual([{ type: "land_changed", from: "closed", to: "check", area: null }]);
  });

  it("stays quiet moving between two Crown blocks", () => {
    const w = new BoundaryWatcher();
    w.update(at("87D", crown));
    w.update(at("87D", crown2));
    expect(w.update(at("87D", crown2))).toEqual([]);
    expect(w.current?.land.area?.id).toBe(4);
  });

  it("can report both crossings on the same fix", () => {
    const w = new BoundaryWatcher({ confirmFixes: 1 });
    w.update(at("87D", crown));
    expect(w.update(at(null, check))).toEqual([
      { type: "wmu_changed", from: "87D", to: null },
      { type: "land_changed", from: "crown", to: "check", area: null },
    ]);
  });

  it("starts over after reset", () => {
    const w = new BoundaryWatcher({ confirmFixes: 1 });
    w.update(at("87D", crown));
    w.reset();
    expect(w.update(at("87C", park))).toEqual([]);
  });
});
