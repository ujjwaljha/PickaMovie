import { describe, expect, it } from "vitest";
import type { Title } from "../domain/types";
import { loadLibrary } from "./library";

const stored: Title = {
  id: "tmdb-movie-129",
  name: "Spirited Away",
  year: 2001,
  kind: "anime",
  creator: "Hayao Miyazaki",
  language: "Japanese",
  synopsis: "A girl wanders into a spirit bathhouse.",
  highlights: ["Quiet", "Wonder"],
  vibeTags: ["Epic"],
  critic: 85,
  audience: 85,
  pacing: "engaged",
  intensity: 5,
  runtimeMinutes: 125,
  palette: ["#163a4a", "#d64545"],
  angle: 140,
  mark: "SA",
  aliases: [],
  fits: { focus: 70, relaxed: 40, emotional: 60, solo: 70, date: 50, group: 40 },
};

describe("saved catalog titles", () => {
  it("keeps a real streaming listing and drops a script link", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          [stored.id]: {
            ...stored,
            watch: {
              region: "IN",
              stream: ["Netflix"],
              rent: [],
              buy: [],
              link: "javascript:alert(1)",
            },
          },
          bad: {
            ...stored,
            id: "tmdb-movie-1",
            watch: { region: "ZZ", stream: ["Secret"], rent: [], buy: [], link: "https://evil.example" },
          },
        }),
    };
    const library = loadLibrary(storage);
    expect(library[stored.id]?.watch).toEqual({ region: "IN", stream: ["Netflix"], rent: [], buy: [] });
    expect(library["tmdb-movie-1"]?.watch).toBeUndefined();
  });
});