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
| `src/MeshtasticRadio.ts` | The real radio behind `RadioService`: send/receive on the party channel, auto-reconnect with backoff |
| `src/webBluetoothLink.ts` | Opens a link to a Heltec V3 over Web Bluetooth with `@meshtastic/core` |
| `src/ScreenWakeLock.ts` | Keeps the screen on while the radio is in use, and asks again when the app comes back |
| `browser-shims/`, `src/processShim.ts` | Let `@meshtastic/core` load in the browser (it bundles a Node-only logger) |

## Design decisions

- **One `RadioService`, two implementations.** `MeshtasticRadio` (Web Bluetooth + `@meshtastic/core`)
  for the real radios, `MockRadio` for tests and as the demo fallback.
- **Positions go out on Meshtastic's `PRIVATE_APP` port (256)** as our 15-byte payload, broadcast on the
  party channel (index 0 by default). Firmware relays it like any other packet. Hops come from the
  packet's `hopStart`/`hopLimit` (firmware 2.3+), and relayed duplicates are dropped by `seq`.
- **Bluetooth drops are expected.** A drop the user didn't ask for retries after 1, 2, 5, 10, then every
  30 s, reusing the radio picked at pairing (the browser's chooser needs a tap, so it only shows on Pair).
- **The library's logger is switched off.** `@meshtastic/core` bundles a Node logger that needs `Buffer`,
  `process` and Node modules. With its level above every message it returns before touching them.
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

## Bench test (two radios, two Android phones)

1. Both radios on the same channel and key (until T14 sets the party key by QR, use the Meshtastic app).
2. Run the app over USB (`chrome://inspect` port forwarding to `localhost`), sign in, open **Party**.
3. **Pair radio** on each phone and pick its radio. The card shows the node id (`!xxxxxxxx`).
4. **Send my position** on one phone. Within a few seconds the other lists that node with distance, time and hops.
5. Turn one phone's screen off for a minute, then on: the card shows "Connecting to radio…" and comes back
   to "Radio connected" by itself.

While the radios are on the default channel, positions are readable by any Meshtastic user nearby, so
only bench test there.

## Licence note

`@meshtastic/core` and `@meshtastic/transport-web-bluetooth` are GPL-3.0. Fine for the course; if
MapleHunt were ever distributed outside it, the app would have to be GPL too, or talk to the radio
another way.

## Next

- T14: put the party channel's AES-256 key in the invite QR and set it on the radio (`setChannel`).
- T15: run `PositionBroadcaster` and `PartyRangeMonitor` on the real radio, 5 km ring and alert.
- Field Day 1 range walk.
