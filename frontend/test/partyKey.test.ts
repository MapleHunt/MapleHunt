import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/data/db";
import { joinLink, joinParty } from "../src/data/party";
import {
  adoptInviteKey,
  captureInviteFromUrl,
  inviteCaptured,
  parseInvite,
  ensurePartyKey,
  getPartyKey,
  isPartyKey,
  keyFromHash,
  newPartyKey,
  partyKeyBytes,
  pendingJoin,
} from "../src/data/partyKey";

afterEach(async () => {
  vi.restoreAllMocks();
  await db.kv.clear();
});

describe("party radio key", () => {
  it("is 32 random bytes (AES-256), URL-safe, different every time", () => {
    const a = newPartyKey();
    const b = newPartyKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(partyKeyBytes(a)).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it("rejects anything that isn't a 32-byte key", () => {
    expect(isPartyKey("abc")).toBe(false);
    expect(isPartyKey(newPartyKey() + "AA")).toBe(false);
    expect(isPartyKey("not a key!!")).toBe(false);
    expect(isPartyKey(null)).toBe(false);
  });

  it("is made once per party on the tag holder's phone", async () => {
    const first = await ensurePartyKey("party-1");
    expect(await ensurePartyKey("party-1")).toBe(first);
    expect(await getPartyKey("party-1")).toBe(first);
    expect(await getPartyKey("party-2")).toBeNull();
  });
});

describe("invite link", () => {
  it("carries the key only in the #fragment, which never reaches a server", () => {
    const key = newPartyKey();
    const link = new URL(joinLink("mh-abc123", key));
    expect(link.pathname).toBe("/join/MH-ABC123");
    expect(link.search).toBe("");
    expect(keyFromHash(link.hash)).toBe(key);
  });

  it("still works without a key (members who joined by typing the code)", () => {
    expect(joinLink("MH-ABC123")).toBe(`${location.origin}/join/MH-ABC123`);
    expect(keyFromHash("")).toBeNull();
    expect(keyFromHash("#k=tampered")).toBeNull();
  });
});

describe("scan-to-join", () => {
  it("with no signal: keeps the key and queues the join for later", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const key = newPartyKey();

    expect(await joinParty("mh-abc123", key)).toBe("queued");
    expect(await pendingJoin()).toBe("MH-ABC123");

    // Once the server confirms the join, the key is filed under the party.
    expect(await adoptInviteKey("MH-ABC123", "party-9")).toBe(key);
    expect(await getPartyKey("party-9")).toBe(key);
  });
});

describe("parseInvite", () => {
  const key = newPartyKey();

  it("reads the code and key from an invite QR, whatever host made it", () => {
    expect(parseInvite(`http://localhost:5173/join/MH-ABC123#k=${key}`)).toEqual({ code: "MH-ABC123", key });
    expect(parseInvite(`https://maplehunt.vercel.app/join/mh-abc123#k=${key}`)).toEqual({ code: "MH-ABC123", key });
  });

  it("accepts a bare join code or a link without a key", () => {
    expect(parseInvite(" mh-abc123 ")).toEqual({ code: "MH-ABC123", key: null });
    expect(parseInvite("https://x.example/join/MH-ABC123")).toEqual({ code: "MH-ABC123", key: null });
  });

  it("ignores QR codes that aren't party invites", () => {
    expect(parseInvite("https://example.com/menu")).toBeNull();
    expect(parseInvite("WIFI:S:camp;T:WPA;P:secret;;")).toBeNull();
    expect(parseInvite("https://x.example/join/not a code")).toBeNull();
  });
});

describe("opening an invite link before signing in", () => {
  it("keeps the code and key, and takes the key out of the address bar", async () => {
    const key = newPartyKey();
    history.replaceState(null, "", `/join/MH-ZZZ999#k=${key}`);

    captureInviteFromUrl();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/join/MH-ZZZ999");

    expect(await inviteCaptured()).toBe("MH-ZZZ999");
    expect(await pendingJoin()).toBe("MH-ZZZ999");
    expect(await adoptInviteKey("MH-ZZZ999", "party-5")).toBe(key);
    history.replaceState(null, "", "/");
  });
});
