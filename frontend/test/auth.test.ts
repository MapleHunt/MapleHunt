import { describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { initials, nextUser } from "../src/data/auth";

function session(email: string, meta: Record<string, string> = {}): Session {
  return { user: { id: "u1", email, user_metadata: meta } } as unknown as Session;
}

const hunter = { id: "u1", email: "hunter@example.com", name: "Sam Hunter" };

describe("nextUser", () => {
  it("signs in when Supabase has a session", () => {
    expect(nextUser(null, "SIGNED_IN", session("hunter@example.com", { display_name: "Sam Hunter" }))).toEqual(hunter);
  });

  it("uses the Google name, then the email, for the display name", () => {
    expect(nextUser(null, "SIGNED_IN", session("sam@example.com", { full_name: "Sam G" }))?.name).toBe("Sam G");
    expect(nextUser(null, "SIGNED_IN", session("sam@example.com"))?.name).toBe("sam");
  });

  it("stays signed in when an expired token can't refresh offline", () => {
    expect(nextUser(hunter, "INITIAL_SESSION", null)).toEqual(hunter);
  });

  it("signs out only on SIGNED_OUT", () => {
    expect(nextUser(hunter, "SIGNED_OUT", null)).toBeNull();
  });
});

describe("initials", () => {
  it("takes the first and last name", () => {
    expect(initials("Sam Lee Hunter")).toBe("SH");
  });

  it("takes two letters from a single name", () => {
    expect(initials("paviter")).toBe("PA");
  });
});
