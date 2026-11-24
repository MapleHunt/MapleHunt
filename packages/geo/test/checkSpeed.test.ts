import { describe, expect, it } from "vitest";
import { checkPosition, type LandArea, type WmuArea } from "../src/landCheck";
import { CAMP } from "./helpers";

// A real WMU outline from GeoHub has a few thousand vertices; Crown land in the
// map pack area is a few hundred parcels. The phone has to answer in <= 100 ms.
function ring(center: { lat: number; lon: number }, radiusDeg: number, vertices: number): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < vertices; i++) {
    const a = (i / vertices) * 2 * Math.PI;
    const wobble = 1 + 0.05 * Math.sin(a * 37);
    pts.push([center.lon + radiusDeg * wobble * Math.cos(a), center.lat + radiusDeg * wobble * Math.sin(a)]);
  }
  pts.push(pts[0]!);
  return pts;
}

describe("checkPosition speed", () => {
  it("answers well under 100 ms for a WMU-sized load", () => {
    const wmus: WmuArea[] = Array.from({ length: 12 }, (_, i) => ({
      wmuCode: `W${i}`,
      geometry: { type: "Polygon", coordinates: [ring({ lat: CAMP.lat + (i - 6) * 0.6, lon: CAMP.lon }, 0.3, 5000)] },
    }));
    const lands: LandArea[] = Array.from({ length: 400 }, (_, i) => ({
      id: i,
      category: "crown",
      huntingStatus: "open",
      geometry: { type: "Polygon", coordinates: [ring({ lat: CAMP.lat + ((i % 20) - 10) * 0.02, lon: CAMP.lon + (Math.floor(i / 20) - 10) * 0.02 }, 0.008, 200)] },
    }));

    checkPosition(CAMP, wmus, lands);
    const runs = 20;
    const start = performance.now();
    for (let i = 0; i < runs; i++) checkPosition({ lat: CAMP.lat + i * 0.001, lon: CAMP.lon }, wmus, lands);
    const perCheck = (performance.now() - start) / runs;
    expect(perCheck).toBeLessThan(100);
  });
});
