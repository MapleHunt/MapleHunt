import { describe, expect, it } from "vitest";
import { checkPosition, findWmu, landAdvice, pointInArea, type LandArea, type WmuArea } from "../src/landCheck";
import { CAMP, square } from "./helpers";

const wmu47: WmuArea = { wmuCode: "47", geometry: { type: "Polygon", coordinates: [square(CAMP, 0.2)] } };
const wmu48: WmuArea = {
  wmuCode: "48",
  geometry: { type: "Polygon", coordinates: [square({ lat: CAMP.lat, lon: CAMP.lon + 0.4 }, 0.2)] },
};

const crown: LandArea = {
  id: 1,
  category: "crown",
  name: "Crown block A",
  huntingStatus: "open",
  // Crown land with a private lot cut out of the middle
  geometry: { type: "Polygon", coordinates: [square(CAMP, 0.05), square(CAMP, 0.01)] },
};
const park: LandArea = {
  id: 2,
  category: "park",
  name: "Provincial park",
  huntingStatus: "closed",
  geometry: { type: "MultiPolygon", coordinates: [[square({ lat: CAMP.lat + 0.1, lon: CAMP.lon }, 0.02)]] },
};
const conservation: LandArea = {
  id: 3,
  category: "conservation",
  huntingStatus: "open",
  geometry: { type: "Polygon", coordinates: [square({ lat: CAMP.lat - 0.1, lon: CAMP.lon }, 0.02)] },
};
const lands = [crown, park, conservation];

describe("pointInArea", () => {
  it("handles holes in polygons", () => {
    expect(pointInArea({ lat: CAMP.lat + 0.03, lon: CAMP.lon }, crown.geometry)).toBe(true);
    expect(pointInArea(CAMP, crown.geometry)).toBe(false); // inside the hole
  });
});

describe("findWmu", () => {
  it("finds the WMU a fix falls in", () => {
    expect(findWmu(CAMP, [wmu47, wmu48])).toBe("47");
    expect(findWmu({ lat: CAMP.lat, lon: CAMP.lon + 0.45 }, [wmu47, wmu48])).toBe("48");
  });

  it("returns null outside every loaded WMU", () => {
    expect(findWmu({ lat: 50, lon: -85 }, [wmu47, wmu48])).toBeNull();
  });
});

describe("landAdvice", () => {
  it("says open only on Crown land", () => {
    const a = landAdvice({ lat: CAMP.lat + 0.03, lon: CAMP.lon }, lands);
    expect(a.status).toBe("crown");
    expect(a.area?.id).toBe(1);
  });

  it("never says open for non-Crown land, even if marked open", () => {
    const a = landAdvice({ lat: CAMP.lat - 0.1, lon: CAMP.lon }, lands);
    expect(a.status).toBe("check");
    expect(a.message).toBe("Check access");
  });

  it("flags closed land", () => {
    expect(landAdvice({ lat: CAMP.lat + 0.1, lon: CAMP.lon }, lands).status).toBe("closed");
  });

  it("says check access where there is no data (e.g. a private lot)", () => {
    const a = landAdvice(CAMP, lands);
    expect(a).toEqual({ status: "check", message: "Check access", area: null });
  });
});

describe("checkPosition", () => {
  it("combines WMU and land in one call", () => {
    const r = checkPosition({ lat: CAMP.lat + 0.03, lon: CAMP.lon }, [wmu47, wmu48], lands);
    expect(r.wmuCode).toBe("47");
    expect(r.land.status).toBe("crown");
  });
});
