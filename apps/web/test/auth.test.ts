import { describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { nextUser } from "../src/auth/auth";

const hunter = { id: "u1", email: "hunter@example.com" };
const session = { user: { id: "u1", email: "hunter@example.com" } } as Session;

describe("nextUser", () => {
  it("signs in when Supabase has a session", () => {
    expect(nextUser(null, "SIGNED_IN", session)).toEqual(hunter);
  });

  it("stays signed in when an expired token can't refresh offline", () => {
    expect(nextUser(hunter, "INITIAL_SESSION", null)).toEqual(hunter);
  });

  it("signs out only on SIGNED_OUT", () => {
    expect(nextUser(hunter, "SIGNED_OUT", null)).toBeNull();
  });

  it("stays signed out on startup with no stored user", () => {
    expect(nextUser(null, "INITIAL_SESSION", null)).toBeNull();
  });
});
