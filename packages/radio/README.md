# @maplehunt/radio

The party radio layer: how the app sends and hears positions over the LoRa mesh.

Owner: Paviter (maps & radio)

## What's in it

| File | What it does |
|---|---|
| `src/RadioService.ts` | The one interface the app uses for the radio |
| `src/MockRadio.ts` | `MockMesh` + `MockRadio`: an in-memory mesh with relaying, cut links and a hop limit |
| `src/positionCodec.ts` | 15-byte binary position format for the private party channel |
| `src/PositionBroadcaster.ts` | Sends this phone's fix every 60 s |

## Design decisions

- **One `RadioService`, two implementations.** `MockRadio` now, so the UI can be built and tested
  before the hardware is set up; `MeshtasticRadio` (Web Bluetooth + Meshtastic JS) next.
- **The app sends positions itself.** The Meshtastic firmware re-stamps a stored position when it
  rebroadcasts, so a dead phone would still look fresh. With the app sending, a silent phone shows up
  as lost contact, never a stale "fine".
- **Full precision.** Positions are sent as lat/lon × 1e7 (about 1 cm). The channel's default
  position precision of 0 sends nothing.
- **No fix, no packet.** If the phone has no GPS fix, nothing is sent, so the party sees silence.

## Hardware (for `MeshtasticRadio`)

Heltec WiFi LoRa 32 V3, 915 MHz (licence-free in Canada, 902–928 MHz), Meshtastic firmware,
private channel with a random AES-256 key shared by QR in person. Android + Chrome only (Safari has no Web Bluetooth).

## Usage

```ts
import { MockMesh, PositionBroadcaster } from "@maplehunt/radio";

const mesh = new MockMesh();
const radio = mesh.addRadio("pavi");
await radio.connect();

radio.onPosition(({ packet, receivedAt, hops }) => {
  monitor.updatePosition(packet.nodeId, packet, receivedAt);
});

new PositionBroadcaster(radio, getGpsFix).start();
```

`test/keyFlow.test.ts` runs the whole "member crosses 5 km" flow from the design proposal:
three phones, one link out of range and relayed, and the alert firing on every phone.

## Tests

```sh
pnpm --filter @maplehunt/radio test
```

## Next

- `MeshtasticRadio`: pair over Web Bluetooth, join the party channel, send/receive the 15-byte payload.
- Screen wake lock + auto-reconnect when Bluetooth drops (top risk).
- Bench test on the real radios, then field day range walk.
