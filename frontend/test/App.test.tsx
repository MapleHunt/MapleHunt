import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";
import { GeoProvider } from "../src/data/geo";
import { AppStateProvider } from "../src/state/AppState";

const auth = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string } | null, desktop: false }));

// MapLibre needs WebGL, which jsdom doesn't have.
vi.mock("maplibre-gl", () => ({}));
vi.mock("../src/map/RealMap", () => ({ RealMap: () => null }));
vi.mock("../src/data/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/data/sync")>()),
  startAutoSync: () => () => undefined,
}));
vi.mock("../src/data/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/data/auth")>()),
  useAuthUser: () => auth.user,
}));
vi.mock("../src/hooks/useMediaQuery", () => ({ useIsDesktop: () => auth.desktop, useMediaQuery: () => auth.desktop }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppStateProvider>
        <GeoProvider>
          <App />
        </GeoProvider>
      </AppStateProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.user = null;
  auth.desktop = false;
});

describe("App", () => {
  it("asks you to sign in first", () => {
    renderAt("/map");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("shows the phone tabs once signed in", () => {
    auth.user = { id: "u1", email: "hunter@example.com", name: "Sam Hunter" };
    renderAt("/map");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });
});
