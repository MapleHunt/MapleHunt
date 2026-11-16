/// <reference types="web-bluetooth" />
import "./processShim";
import { MeshDevice } from "@meshtastic/core";
import { TransportWebBluetooth } from "@meshtastic/transport-web-bluetooth";
import { PRIVATE_APP_PORT, type LinkOpener, type MeshLink, type MeshPacketIn } from "./MeshtasticRadio";

// Values of the library's DeviceStatusEnum.
const DEVICE_DISCONNECTED = 2;
const DEVICE_CONFIGURED = 7;

interface RawMeshPacket {
  from: number;
  channel: number;
  hopStart?: number;
  hopLimit?: number;
  rxSnr?: number;
  payloadVariant: { case: string; value?: { portnum?: number; payload?: Uint8Array } };
}

interface Dispatcher<T> {
  subscribe(fn: (value: T) => void): unknown;
  unsubscribe(fn: (value: T) => void): void;
}

interface MeshEvents {
  onMeshPacket: Dispatcher<RawMeshPacket>;
  onMyNodeInfo: Dispatcher<{ myNodeNum: number }>;
  onDeviceStatus: Dispatcher<number>;
}

function listen<T>(dispatcher: Dispatcher<T>, fn: (value: T) => void): () => void {
  dispatcher.subscribe(fn);
  return () => dispatcher.unsubscribe(fn);
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Opens links to a Meshtastic radio over Web Bluetooth (Chrome on Android).
 * The first open shows the browser's device chooser, which needs a user tap;
 * reconnects reuse the radio picked then.
 */
export function webBluetoothOpener(options: { configureTimeoutMs?: number } = {}): LinkOpener {
  let device: BluetoothDevice | null = null;

  return async (reconnect) => {
    if (!isWebBluetoothAvailable()) throw new Error("This browser can't use Bluetooth radios. Use Chrome on Android.");
    if (!reconnect || !device) {
      if (reconnect) throw new Error("No radio picked yet");
      device = await navigator.bluetooth.requestDevice({ filters: [{ services: [TransportWebBluetooth.ServiceUuid] }] });
    }
    const transport = await TransportWebBluetooth.createFromDevice(device);
    const mesh = new MeshDevice(transport);
    // The library bundles a Node-only logger that would call missing Node APIs in
    // the browser. Above every level, it returns before doing anything.
    mesh.log.settings.minLevel = 7;
    return configure(mesh, options.configureTimeoutMs ?? 20_000);
  };
}

function configure(mesh: MeshDevice, timeoutMs: number): Promise<MeshLink> {
  const events = mesh.events as unknown as MeshEvents;
  let nodeNum: number | null = null;

  return new Promise<MeshLink>((resolve, reject) => {
    const stopInfo = listen(events.onMyNodeInfo, (info) => {
      nodeNum = info.myNodeNum;
    });
    const fail = (err: Error) => {
      cleanup();
      void mesh.disconnect().catch(() => undefined);
      reject(err);
    };
    const stopStatus = listen(events.onDeviceStatus, (status) => {
      if (status === DEVICE_DISCONNECTED) fail(new Error("The radio disconnected while setting up"));
      if (status !== DEVICE_CONFIGURED) return;
      if (nodeNum === null) return fail(new Error("The radio didn't report its node number"));
      cleanup();
      resolve(toLink(mesh, events, nodeNum));
    });
    const timer = setTimeout(() => fail(new Error("The radio didn't answer. Is it on and close by?")), timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      stopInfo();
      stopStatus();
    }
    mesh.configure().catch((err: unknown) => fail(err instanceof Error ? err : new Error(String(err))));
  });
}

function toLink(mesh: MeshDevice, events: MeshEvents, nodeNum: number): MeshLink {
  let closing = false;
  return {
    nodeNum,
    async send(payload, channel) {
      await mesh.sendPacket(payload, PRIVATE_APP_PORT, "broadcast", channel, false, false);
    },
    onPacket(listener) {
      return listen(events.onMeshPacket, (raw) => {
        const decoded = raw.payloadVariant.case === "decoded" ? raw.payloadVariant.value : undefined;
        if (!decoded?.payload || decoded.portnum === undefined) return;
        const packet: MeshPacketIn = {
          from: raw.from,
          channel: raw.channel,
          portnum: decoded.portnum,
          payload: decoded.payload,
          ...(raw.hopStart !== undefined ? { hopStart: raw.hopStart } : {}),
          ...(raw.hopLimit !== undefined ? { hopLimit: raw.hopLimit } : {}),
          ...(raw.rxSnr !== undefined ? { rxSnr: raw.rxSnr } : {}),
        };
        listener(packet);
      });
    },
    onDrop(listener) {
      return listen(events.onDeviceStatus, (status) => {
        if (status === DEVICE_DISCONNECTED && !closing) listener();
      });
    },
    async close() {
      closing = true;
      await mesh.disconnect().catch(() => undefined);
    },
  };
}
