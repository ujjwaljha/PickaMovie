import { describe, expect, it } from "vitest";
import { createTmdbSource, mapTmdbTitle, type TmdbResult } from "./tmdb";

const spirited: TmdbResult = {
  id: 129,
  media_type: "movie",
  title: "Spirited Away",
  overview: "A girl wanders into a spirit bathhouse and has to work her way home.",
  vote_average: 8.5,
  genre_ids: [16, 14, 10751],
  release_date: "2001-07-20",
  original_language: "ja",
  runtime: 125,
};

const breaking: TmdbResult = {
  id: 1396,
  media_type: "tv",
  name: "Breaking Bad",
  overview: "A teacher makes a catastrophic career change.",
  vote_average: 8.9,
  genre_ids: [18, 80],
  first_air_date: "2008-01-20",
  original_language: "en",
  episode_run_time: [48],
  number_of_episodes: 62,
};

describe("TMDB adapter", () => {
  it("normalizes a Japanese animated film into the anime comparison shape", () => {
    const title = mapTmdbTitle(spirited);
    expect(title).toMatchObject({
      id: "tmdb-movie-129",
      name: "Spirited Away",
      year: 2001,
      kind: "anime",
      runtimeMinutes: 125,
      critic: 85,
      audience: 85,
      language: "Japanese",
    });
    expect(title?.posterUrl).toBeUndefined();
    expect(title?.vibeTags).toContain("Epic");
    expect(title?.fits.group).toBeGreaterThan(70);
  });

  it("turns a drama series into season-length minutes", () => {
    const title = mapTmdbTitle(breaking);
    expect(title?.kind).toBe("series");
    expect(title?.episodeCount).toBe(62);
    expect(title?.episodeMinutes).toBe(48);
    expect(title?.runtimeMinutes).toBe(62 * 48);
    expect(title?.approximate).toBe(true);
    expect(title?.year).toBe(2008);
  });

  it("keeps a TMDB poster path and a director, and drops a foreign image URL", () => {
    const title = mapTmdbTitle({
      ...spirited,
      poster_path: "/spirited.jpg",
      credits: { crew: [{ job: "Director", name: "Hayao Miyazaki" }] },
    });
    expect(title?.posterUrl).toBe("https://image.tmdb.org/t/p/w342/spirited.jpg");
    expect(title?.creator).toBe("Hayao Miyazaki");
    expect(title?.highlights[1]).toBe("Hayao Miyazaki");
    expect(mapTmdbTitle({ ...spirited, poster_path: "https://evil.example/x.jpg" })?.posterUrl).toBeUndefined();
    expect(mapTmdbTitle({ ...spirited, poster_path: "/../secret.jpg" })?.posterUrl).toBeUndefined();
  });

  it("uses the published genre names, rating count, and cast", () => {
    const title = mapTmdbTitle({
      ...breaking,
      vote_count: 15432,
      genres: [
        { id: 18, name: "Drama" },
        { id: 80, name: "Crime" },
      ],
      credits: { cast: [{ name: "Bryan Cranston", order: 0 }, { name: "Aaron Paul", order: 1 }] },
      number_of_seasons: 5,
    });
    expect(title?.vibeTags).toEqual(["Drama", "Crime"]);
    expect(title?.highlights[0]).toBe("TMDB user score, from 15,432 ratings.");
    expect(title?.highlights[1]).toBe("With Bryan Cranston, Aaron Paul.");
  });

  it("skips people and nameless rows", () => {
    expect(mapTmdbTitle({ id: 1, media_type: "person", name: "Someone" })).toBeNull();
    expect(mapTmdbTitle({ id: 2, media_type: "movie" })).toBeNull();
  });

  it("searches through an injected proxy and never puts a key on the path", async () => {
    const calls: string[] = [];
    const source = createTmdbSource(async (path) => {
      calls.push(path);
      if (path.startsWith("/search/")) {
        return { results: [spirited, { id: 10, media_type: "person", name: "Hayao Miyazaki" }] };
      }
      return breaking;
    });

    const found = await source.search("spirited away");
    expect(calls[0]).toBe("/search/multi?query=spirited%20away");
    expect(found.map((item) => item.id)).toEqual(["tmdb-movie-129"]);
    expect(calls[0]).not.toContain("api_key");

    const hydrated = await source.getMany(["tmdb-tv-1396", "not-a-tmdb-id"]);
    expect(calls[1]).toBe("/tv/1396");
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]?.kind).toBe("series");
  });
});
