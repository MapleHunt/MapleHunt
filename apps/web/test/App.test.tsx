import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";

const auth = vi.hoisted(() => ({ user: { id: "u1", email: "hunter@example.com" } as { id: string; email: string } | null }));

vi.mock("../src/map/MapView", () => ({ MapView: () => null }));
vi.mock("../src/auth/auth", () => ({
  useAuthUser: () => auth.user,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));

beforeEach(() => {
  auth.user = { id: "u1", email: "hunter@example.com" };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  it("opens on the map screen", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: "Map" })).toBeTruthy();
  });

  it("shows all four tabs", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);
    expect(labels).toEqual(["Map", "Party", "Log", "Assistant"]);
  });

  it("switches screens from the bottom nav", () => {
    renderAt("/map");
    fireEvent.click(screen.getByRole("link", { name: "Log" }));
    expect(screen.getByRole("heading", { name: "Harvest log" })).toBeTruthy();
  });

  it("sends unknown paths back to the map", () => {
    renderAt("/does-not-exist");
    expect(screen.getByRole("heading", { name: "Map" })).toBeTruthy();
  });
});

describe("App when signed out", () => {
  it("shows sign-in instead of the tabs", () => {
    auth.user = null;
    renderAt("/map");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});
