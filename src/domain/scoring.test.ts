import { describe, expect, it } from "vitest";
import { PRESETS } from "../data/presets";
import { catalog } from "../services/catalog";
import { narrateDecision, rankPool, scoreTitle, timeFit, weighTitle, type Voter } from "./scoring";
import type { Filters, Title } from "./types";

const anyFilters: Filters = { time: "any", energy: "any", company: "any" };

function title(id: string): Title {
  const found = catalog.get(id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}

function winnerIds(presetId: string): string[] {
  const preset = PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new Error(presetId);
  const people: Voter[] = [{ id: "you", name: "You", filters: preset.filters, picks: preset.titleIds }];
  return rankPool(catalog.getMany(preset.titleIds), people).map((item) => item.title.id);
}

describe("time and mood scoring", () => {
  it("prefers a short romance over an epic when the window is 90 minutes", () => {
    const filters: Filters = { time: "90min", energy: "emotional", company: "date" };
    expect(scoreTitle(title("past-lives"), filters).total).toBeGreaterThan(scoreTitle(title("dune-part-two"), filters).total);
    expect(timeFit(title("dune-part-two"), "90min")).toBeLessThan(timeFit(title("past-lives"), "90min"));
  });

  it("treats one episode as a series shape, not a feature", () => {
    expect(timeFit(title("mushishi"), "episode")).toBeGreaterThan(timeFit(title("parasite"), "episode"));
    const filters: Filters = { time: "episode", energy: "relaxed", company: "solo" };
    expect(scoreTitle(title("mushishi"), filters).total).toBeGreaterThan(scoreTitle(title("parasite"), filters).total);
  });

  it("marks a long season as the wrong size for a single evening", () => {
    expect(timeFit(title("fleabag"), "evening")).toBeGreaterThan(timeFit(title("frieren"), "evening"));
    expect(timeFit(title("frieren"), "evening")).toBeLessThan(0.5);
  });

  it("picks a clear, close winner for each toss-up", () => {
    expect(winnerIds("home-by-eleven")).toEqual(["past-lives", "before-sunrise", "in-the-mood-for-love"]);
    expect(winnerIds("one-couch")).toEqual(["paddington-2", "knives-out", "spider-verse"]);
    expect(winnerIds("phone-down")).toEqual(["parasite", "dune-part-two", "arrival"]);
    expect(winnerIds("lights-out")).toEqual(["mushishi", "reservation-dogs", "aggretsuko"]);

    for (const preset of PRESETS) {
      const people: Voter[] = [{ id: "you", name: "You", filters: preset.filters, picks: preset.titleIds }];
      const ranked = rankPool(catalog.getMany(preset.titleIds), people);
      const gap = ranked[0]!.weigh.total - ranked[1]!.weigh.total;
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThanOrEqual(8);
      expect(narrateDecision(ranked, { groupMode: false, filters: preset.filters })).toContain(ranked[0]!.title.name);
    }
  });

  it("gives a shared pick a bonus over an otherwise equal title", () => {
    const base: Title = {
      ...title("totoro"),
      id: "a",
      name: "A",
    };
    const other: Title = { ...base, id: "b", name: "B" };
    const people: Voter[] = [
      { id: "you", name: "You", filters: anyFilters, picks: ["a", "b"] },
      { id: "friend-1", name: "Alex", filters: anyFilters, picks: ["a"] },
    ];
    const shared = weighTitle(base, people);
    const solo = weighTitle(other, people);
    expect(shared.bonus).toBe(8);
    expect(solo.bonus).toBe(4);
    expect(shared.total).toBeGreaterThan(solo.total);
  });
});
