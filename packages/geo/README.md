# @maplehunt/geo

On-device map checks. Everything here runs on the phone with no signal and no server.

Owner: Paviter (maps & radio)

## What's in it

| File | What it does |
|---|---|
| `src/distance.ts` | `distanceKm(a, b)`: great-circle distance in km (Turf `distance`) |
| `src/partyRange.ts` | `PartyRangeMonitor`: the 5 km party rule and lost-contact alert |
| `src/landCheck.ts` | `findWmu`, `landAdvice`, `checkPosition`: which WMU and what land a GPS fix is on (Turf `booleanPointInPolygon`) |

## Rules it implements (from the R&R)

- **5 km alert (FR-08):** a member more than **5.0 km** from the tag holder raises `too_far`.
  It clears only once they are back under **4.8 km** (`back_in_range`), so the alert never flickers.
- **Lost contact (FR-09):** a member silent for **3× the report interval** (3 × 60 s = 180 s) raises `lost_contact`.
  The next packet from them raises `contact_restored`.
- **Land:** only Crown land is ever shown as open. Closed land says "No hunting here".
  Anything else, including land we have no data for, says **"Check access"**, never "open".

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
const { wmuCode, land } = checkPosition({ lat, lon }, wmuAreas, landAreas);
```

`WmuArea` and `LandArea` mirror `public.wmu_boundaries` and `public.land_areas`; geometry is GeoJSON in `[lon, lat]` order.

## Tests

```sh
pnpm --filter @maplehunt/geo test
```

## Next

- Load WMU 47 + Crown land from the offline map pack (PMTiles) instead of test squares.
- Cross-check `checkPosition` against PostGIS (`wmu_at` / `land_at`) at Arshdeep's 10 test points.
- Measure `checkPosition` against the ≤ 100 ms target on a real Android phone.
