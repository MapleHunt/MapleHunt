import { describe, expect, it } from "vitest";
import type { PositionCheck } from "@maplehunt/geo";
import { boldParts, citationLabel } from "../src/data/assistant";
import { placeLine } from "../src/data/geo";
import { cap, formatDay, maskTag, speciesLabel } from "../src/data/useRecords";

describe("placeLine", () => {
  const crown = { wmuCode: "87D", land: { status: "crown" } } as PositionCheck;

  it("shows the WMU and land status", () => {
    expect(placeLine(crown, true)).toBe("WMU 87D · Crown land · Open");
  });

  it("says when you are outside every known WMU", () => {
    expect(placeLine({ ...crown, wmuCode: null } as PositionCheck, true)).toBe("Outside known WMUs · Crown land · Open");
  });

  it("explains what is missing", () => {
    expect(placeLine(null, false)).toBe("Finding your location…");
    expect(placeLine(null, true)).toBe("Loading land data…");
  });
});

describe("record labels", () => {
  it("names species", () => {
    expect(speciesLabel("wild_turkey")).toBe("Wild turkey");
    expect(speciesLabel("grouse")).toBe("Grouse");
  });

  it("capitalises or shows a dash", () => {
    expect(cap("male")).toBe("Male");
    expect(cap(null)).toBe("—");
  });

  it("hides most of a tag number", () => {
    expect(maskTag("ON-123456")).toBe("•••• 3456");
    expect(maskTag("123")).toBe("123");
    expect(maskTag(null)).toBe("—");
  });

  it("reads a hunt date as a local day", () => {
    expect(formatDay("2026-11-28")).toContain("28");
  });
});

describe("assistant text", () => {
  it("splits bold markers out of an answer", () => {
    expect(boldParts("You **must** wear orange.")).toEqual([
      { text: "You ", bold: false },
      { text: "must", bold: true },
      { text: " wear orange.", bold: false },
    ]);
  });

  it("labels a citation with its page", () => {
    expect(citationLabel({ id: 1, section: null, page: 42, source_url: null, season_year: 2026 })).toBe("2026 Ontario Hunting Regulations · p. 42");
    expect(citationLabel({ id: 1, section: null, page: null, source_url: null, season_year: 2026 })).toBe("2026 Ontario Hunting Regulations");
  });
});
