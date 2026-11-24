import type { LandAdvice, LandStatus, PositionCheck } from "./landCheck";

export type BoundaryEvent =
  | { type: "wmu_changed"; from: string | null; to: string | null }
  | { type: "land_changed"; from: LandStatus; to: LandStatus; area: LandAdvice["area"] };

export interface BoundaryWatcherOptions {
  /**
   * How many fixes in a row must agree before a crossing counts. GPS wanders
   * 5-20 m, so standing on a boundary line would otherwise flip the alert on
   * every fix.
   */
  confirmFixes?: number;
}

interface Pending<T> {
  value: T;
  count: number;
}

const landKey = (land: LandAdvice) => `${land.status}:${land.area?.id ?? ""}`;

/**
 * Turns the land check of every GPS fix into boundary crossing events.
 * The first check only sets the starting point; the current state itself is
 * shown by the map banner, so crossings are the only thing announced here.
 */
export class BoundaryWatcher {
  private readonly confirmFixes: number;
  private wmu: string | null | undefined = undefined;
  private land: LandAdvice | undefined = undefined;
  private pendingWmu: Pending<string | null> | null = null;
  private pendingLand: Pending<LandAdvice> | null = null;

  constructor(options: BoundaryWatcherOptions = {}) {
    this.confirmFixes = Math.max(1, options.confirmFixes ?? 2);
  }

  get current(): PositionCheck | null {
    return this.wmu === undefined || !this.land ? null : { wmuCode: this.wmu, land: this.land };
  }

  update(check: PositionCheck): BoundaryEvent[] {
    if (this.wmu === undefined || !this.land) {
      this.wmu = check.wmuCode;
      this.land = check.land;
      return [];
    }
    const events: BoundaryEvent[] = [];

    if (check.wmuCode === this.wmu) this.pendingWmu = null;
    else {
      this.pendingWmu = this.pendingWmu?.value === check.wmuCode ? { value: check.wmuCode, count: this.pendingWmu.count + 1 } : { value: check.wmuCode, count: 1 };
      if (this.pendingWmu.count >= this.confirmFixes) {
        events.push({ type: "wmu_changed", from: this.wmu, to: check.wmuCode });
        this.wmu = check.wmuCode;
        this.pendingWmu = null;
      }
    }

    const key = landKey(check.land);
    if (key === landKey(this.land)) this.pendingLand = null;
    else {
      this.pendingLand =
        this.pendingLand && landKey(this.pendingLand.value) === key ? { value: check.land, count: this.pendingLand.count + 1 } : { value: check.land, count: 1 };
      if (this.pendingLand.count >= this.confirmFixes) {
        if (check.land.status !== this.land.status) {
          events.push({ type: "land_changed", from: this.land.status, to: check.land.status, area: check.land.area });
        }
        this.land = check.land;
        this.pendingLand = null;
      }
    }
    return events;
  }

  reset(): void {
    this.wmu = undefined;
    this.land = undefined;
    this.pendingWmu = null;
    this.pendingLand = null;
  }
}
