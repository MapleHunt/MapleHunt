import { useSyncExternalStore } from "react";
import { MeshtasticRadio, ScreenWakeLock, isWebBluetoothAvailable, webBluetoothOpener } from "@maplehunt/radio";
import type { RadioConnection, RadioService, ReceivedPosition } from "@maplehunt/radio";

// This phone's party radio (a Heltec V3 over Web Bluetooth). Positions heard
// from other radios are kept per node; T15 feeds them into the 5 km check.

export interface RadioState {
  supported: boolean;
  connection: RadioConnection;
  nodeId: string;
  /** Latest position heard from each other radio, newest first. */
  heard: ReceivedPosition[];
  lastSentAt: number | null;
  error: string | null;
}

let radio: RadioService | null = null;
let state: RadioState = {
  supported: isWebBluetoothAvailable(),
  connection: "disconnected",
  nodeId: "",
  heard: [],
  lastSentAt: null,
  error: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<RadioState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function message(err: unknown): string {
  if (err instanceof DOMException && err.name === "NotFoundError") return "No radio picked.";
  return err instanceof Error ? err.message : String(err);
}

let stopListening: Array<() => void> = [];

/** Lets tests (and the demo fallback) swap in another RadioService, e.g. MockRadio. */
export function setRadioService(service: RadioService, supported = true): void {
  stopListening.forEach((stop) => stop());
  radio = service;
  stopListening = [
    service.onConnectionChange((connection) =>
      set({ connection, nodeId: service.nodeId, ...(connection === "connected" ? { error: null } : {}) }),
    ),
    service.onPosition((pos) => {
      const others = state.heard.filter((h) => h.packet.nodeId !== pos.packet.nodeId);
      set({ heard: [pos, ...others] });
    }),
  ];
  set({ supported, connection: service.getConnection(), nodeId: service.nodeId, heard: [], lastSentAt: null, error: null });
}

function current(): RadioService {
  if (!radio) {
    setRadioService(
      new MeshtasticRadio(webBluetoothOpener(), {
        wakeLock: new ScreenWakeLock(),
        onError: (err) => set({ error: `Reconnecting: ${message(err)}` }),
      }),
      isWebBluetoothAvailable(),
    );
  }
  return radio!;
}

/** Opens the browser's Bluetooth chooser, so call it from a tap. */
export async function pairRadio(): Promise<void> {
  set({ error: null });
  try {
    await current().connect();
  } catch (err) {
    set({ error: message(err) });
  }
}

export async function unpairRadio(): Promise<void> {
  await current().disconnect();
  set({ error: null });
}

export async function sendPosition(fix: { lat: number; lon: number; fixAt: number }): Promise<void> {
  try {
    await current().sendPosition(fix);
    set({ lastSentAt: Date.now(), error: null });
  } catch (err) {
    set({ error: message(err) });
    throw err;
  }
}

export function useRadio(): RadioState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function connectionLabel(connection: RadioConnection): string {
  if (connection === "connected") return "Radio connected";
  if (connection === "connecting") return "Connecting to radio…";
  return "Radio not paired";
}
