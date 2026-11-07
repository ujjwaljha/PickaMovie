import { describe, expect, it } from "vitest";
import { TITLES } from "../data/titles";
import { normalize, rankTitles } from "./search";

describe("shelf search", () => {
  it("suggests a featured mix before anyone types", () => {
    expect(rankTitles("", TITLES).map((title) => title.id)).toEqual([
      "parasite",
      "past-lives",
      "spider-verse",
      "fleabag",
      "frieren",
      "knives-out",
    ]);
  });

  it("matches accents, aliases, creators, and years", () => {
    expect(rankTitles("amelie", TITLES)[0]?.id).toBe("amelie");
    expect(rankTitles("walle", TITLES)[0]?.id).toBe("wall-e");
    expect(rankTitles("spy x", TITLES)[0]?.id).toBe("spy-family");
    expect(rankTitles("miyazaki", TITLES).map((title) => title.id)).toEqual(
      expect.arrayContaining(["spirited-away", "totoro"]),
    );
    expect(rankTitles("1997", TITLES).map((title) => title.id)).toContain("perfect-blue");
    expect(normalize("Amélie")).toBe("amelie");
  });

  it("returns nothing for a title that is not on the shelf", () => {
    expect(rankTitles("zzzz-not-a-movie", TITLES)).toEqual([]);
  });
});
