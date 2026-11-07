import { describe, expect, it } from "vitest";
import { TITLE_BY_ID, TITLES } from "../data/titles";
import { similarTo } from "./similar";

function title(id: string) {
  const found = TITLE_BY_ID.get(id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}

describe("similar titles", () => {
  it("returns nothing when no titles were named", () => {
    expect(similarTo([], TITLES)).toEqual([]);
  });

  it("keeps the titles you named off the suggestion list", () => {
    const hits = similarTo([title("past-lives"), title("parasite")], TITLES);
    const ids = hits.map((hit) => hit.title.id);
    expect(ids).not.toContain("past-lives");
    expect(ids).not.toContain("parasite");
  });

  it("puts a quiet romance near Past Lives", () => {
    const hits = similarTo([title("past-lives")], TITLES);
    const ids = hits.map((hit) => hit.title.id);
    expect(ids.slice(0, 3)).toContain("before-sunrise");
    expect(hits[0]?.reasons.join(" ")).toMatch(/Shares/);
  });

  it("puts Get Out near Parasite", () => {
    const ids = similarTo([title("parasite")], TITLES).map((hit) => hit.title.id);
    expect(ids.slice(0, 4)).toContain("get-out");
  });

  it("keeps Miyazaki next to Spirited Away", () => {
    const ids = similarTo([title("spirited-away")], TITLES).map((hit) => hit.title.id);
    expect(ids.slice(0, 3)).toContain("totoro");
  });
});
