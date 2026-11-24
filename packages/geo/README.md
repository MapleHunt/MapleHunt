# @maplehunt/geo

On-device map checks. Everything here runs on the phone with no signal and no server.

Owner: Paviter (maps & radio)

## What's in it

| File | What it does |
|---|---|
| `src/distance.ts` | `distanceKm(a, b)`: great-circle distance in km (Turf `distance`) |
| `src/partyRange.ts` | `PartyRangeMonitor`: the 5 km party rule and lost-contact alert |
| `src/landCheck.ts` | `findWmu`, `landAdvice`, `checkPosition`: which WMU and what land a GPS fix is on (Turf `booleanPointInPolygon`) |
| `src/boundaryWatch.ts` | `BoundaryWatcher`: turns the check of every fix into `wmu_changed` / `land_changed` crossing events |

## Rules it implements (from the R&R)

- **5 km alert (FR-08):** a member more than **5.0 km** from the tag holder raises `too_far`.
  It clears only once they are back under **4.8 km** (`back_in_range`), so the alert never flickers.
- **Lost contact (FR-09):** a member silent for **3× the report interval** (3 × 60 s = 180 s) raises `lost_contact`.
  The next packet from them raises `contact_restored`.
- **Land:** only Crown land is ever shown as open. Closed land says "No hunting here".
  Anything else, including land we have no data for, says **"Check access"**, never "open".

- **Boundary alert (M3):** a crossing counts only after **2 fixes in a row** agree, so standing on a line doesn't flip the alert. The app skips fixes worse than ±100 m.

Every phone runs its own monitor, so every member sees the alert, including the one who walked too far.

## Usage

```ts
import { PartyRangeMonitor, checkPosition } from "@maplehunt/geo";

const monitor = new PartyRangeMonitor(tagHolderId, memberIds);

// every position heard over LoRa, and your own fixes
const events = monitor.updatePosition(nodeId, { lat, lon }, heardAt);

// every few seconds
const lost = monitor.tick(Date.now());

// on every GPS fix: WMU chip + land banner
const check = checkPosition({ lat, lon }, wmuAreas, landAreas);
const crossings = watcher.update(check); // watcher = new BoundaryWatcher()
```

`WmuArea` and `LandArea` mirror `public.wmu_boundaries` and `public.land_areas`; geometry is GeoJSON in `[lon, lat]` order.

## Tests

```sh
pnpm --filter @maplehunt/geo test
```

## Next

- Load WMU 87D + Crown land from the offline map pack instead of test squares. The pack (map-packs/manifest.json in Supabase Storage) has `wmu` (wmuCode) and `land` (category, huntingStatus) layers.
- Cross-check `checkPosition` against PostGIS (`wmu_at` / `land_at` / `check_position`, live since migration 0005) at Arshdeep's 10 test points (T24).
- Measure `checkPosition` on a real Android phone. `test/checkSpeed.test.ts` checks the ≤ 100 ms target on a desktop with 12 WMUs of 5000 vertices and 400 Crown parcels.
