import { describe, expect, it } from "vitest";
import { addBlockReason, applyHash, defaultSession, loadSession, reduceSession, sanitizeSession, saveSession, sessionToHash } from "./session";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe("session memory", () => {
  it("caps the table at four titles", () => {
    let session = defaultSession();
    for (const id of ["past-lives", "parasite", "totoro", "fleabag", "coco"]) {
      session = reduceSession(session, { type: "add", titleId: id });
    }
    expect(session.order).toEqual(["past-lives", "parasite", "totoro", "fleabag"]);
    expect(addBlockReason(session, "coco")).toBe("full");
  });

  it("lets a friend stamp a title without duplicating the row", () => {
    let session = reduceSession(defaultSession(), { type: "add-person" });
    session = reduceSession(session, { type: "set-active", personId: "you" });
    session = reduceSession(session, { type: "add", titleId: "paddington-2" });
    session = reduceSession(session, { type: "set-active", personId: "friend-1" });
    session = reduceSession(session, { type: "add", titleId: "paddington-2" });
    expect(session.order).toEqual(["paddington-2"]);
    expect(session.people.map((person) => person.picks)).toEqual([["paddington-2"], ["paddington-2"]]);
  });

  it("drops a title when the only person who picked it leaves", () => {
    let session = reduceSession(defaultSession(), { type: "add-person" });
    session = reduceSession(session, { type: "add", titleId: "fleabag" });
    session = reduceSession(session, { type: "remove-person", personId: "friend-1" });
    expect(session.order).toEqual([]);
    expect(session.groupMode).toBe(true);
  });

  it("round-trips a couch session through storage and the hash", () => {
    let session = reduceSession(defaultSession(), { type: "load-preset", presetId: "home-by-eleven" });
    session = reduceSession(session, { type: "add-person" });
    session = reduceSession(session, { type: "add", titleId: "paddington-2" });
    session = reduceSession(session, { type: "weigh" });
    const hash = sessionToHash(session);
    expect(hash.startsWith("#")).toBe(true);
    expect(hash.includes("%")).toBe(false);
    expect(hash).toContain("past-lives");
    expect(hash).not.toContain("paddington-2");
    const store = memory();
    saveSession(store, session);
    const loaded = loadSession(store, hash);
    expect(loaded.verdictId).toBe(session.verdictId);
    expect(loaded.order).toEqual(session.order);
    expect(loaded.people).toHaveLength(2);
    expect(loaded.people[1]?.picks).toEqual(["paddington-2"]);
  });

  it("opens a shared link on an empty browser", () => {
    const loaded = loadSession(memory(), "#w=mushishi.aggretsuko&t=episode&e=relaxed&c=solo");
    expect(loaded.order).toEqual(["mushishi", "aggretsuko"]);
    expect(loaded.people[0]?.filters).toEqual({ time: "episode", energy: "relaxed", company: "solo" });
  });

  it("rejects unsafe stored colors and unknown ids", () => {
    const clean = sanitizeSession({
      people: [
        {
          id: "you",
          name: "You\u0000",
          color: "red;background:url(https://evil.example)",
          filters: { time: "nope", energy: "focus", company: "date" },
          picks: ["<script>", "parasite"],
        },
      ],
      order: ["parasite", "javascript:alert(1)"],
      groupMode: "yes",
    });
    expect(clean.people[0]?.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(clean.people[0]?.name).toBe("You");
    expect(clean.order).toEqual(["parasite"]);
    expect(clean.people[0]?.filters.time).toBe("any");
    expect(clean.people[0]?.filters.energy).toBe("focus");
    expect(clean.groupMode).toBe(false);
  });

  it("keeps a mirrored hash from wiping a stored verdict", () => {
    const session = reduceSession(reduceSession(defaultSession(), { type: "load-preset", presetId: "lights-out" }), {
      type: "weigh",
    });
    expect(applyHash(session, sessionToHash(session)).verdictId).toBe(session.verdictId);
  });
});
