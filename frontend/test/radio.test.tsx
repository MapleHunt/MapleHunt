import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MockMesh } from "@maplehunt/radio";
import type { MockRadio } from "@maplehunt/radio";
import { GeoProvider } from "../src/data/geo";
import { connectionLabel, pairRadio, sendPosition, setRadioService, unpairRadio, useRadio } from "../src/data/radio";
import { RadioCard } from "../src/screens/mobile/RadioCard";

let mesh: MockMesh;
let mine: MockRadio;
let arsh: MockRadio;

beforeEach(() => {
  mesh = new MockMesh({ now: () => Date.now() });
  mine = mesh.addRadio("!0000a001");
  arsh = mesh.addRadio("!0000a002");
  setRadioService(mine);
});

function renderCard() {
  return render(
    <GeoProvider>
      <RadioCard />
    </GeoProvider>,
  );
}

describe("radio store", () => {
  it("pairs, hears other radios and disconnects", async () => {
    let latest: ReturnType<typeof useRadio> | null = null;
    function Probe() {
      latest = useRadio();
      return null;
    }
    render(<Probe />);

    await act(() => pairRadio());
    expect(latest!.connection).toBe("connected");
    expect(latest!.nodeId).toBe("!0000a001");

    await arsh.connect();
    act(() => void arsh.sendPosition({ lat: 45.31, lon: -78.1, fixAt: Date.now() }));
    act(() => void arsh.sendPosition({ lat: 45.32, lon: -78.1, fixAt: Date.now() }));
    expect(latest!.heard).toHaveLength(1);
    expect(latest!.heard[0]!.packet).toMatchObject({ nodeId: "!0000a002", lat: 45.32 });

    await act(() => unpairRadio());
    expect(latest!.connection).toBe("disconnected");
  });

  it("records when a position went out and reports send errors", async () => {
    await expect(sendPosition({ lat: 45.31, lon: -78.1, fixAt: Date.now() })).rejects.toThrow("not connected");

    await pairRadio();
    await sendPosition({ lat: 45.31, lon: -78.1, fixAt: Date.now() });

    let latest: ReturnType<typeof useRadio> | null = null;
    function Probe() {
      latest = useRadio();
      return null;
    }
    render(<Probe />);
    expect(latest!.lastSentAt).not.toBeNull();
    expect(latest!.error).toBeNull();
  });

  it("labels each connection state", () => {
    expect(connectionLabel("disconnected")).toBe("Radio not paired");
    expect(connectionLabel("connecting")).toBe("Connecting to radio…");
    expect(connectionLabel("connected")).toBe("Radio connected");
  });
});

describe("RadioCard", () => {
  it("offers to pair, then shows the node id and who was heard", async () => {
    renderCard();
    expect(screen.getByText("Radio not paired")).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pair radio" })));
    expect(screen.getByText("Radio connected")).toBeTruthy();
    expect(screen.getByText("!0000a001")).toBeTruthy();

    await arsh.connect();
    act(() => void arsh.sendPosition({ lat: 45.31, lon: -78.1, fixAt: Date.now() }));
    expect(screen.getByText("!0000a002")).toBeTruthy();
    expect(screen.getByText(/direct/)).toBeTruthy();
  });

  it("explains when this browser can't pair a radio", () => {
    setRadioService(mine, false);
    renderCard();
    expect(screen.getByText("Pairing a radio needs Chrome on Android.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pair radio" })).toBeNull();
  });
});
