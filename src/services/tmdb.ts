import { languageName } from "../domain/languages";
import { WATCH_REGIONS } from "../domain/regions";
import type { Fits, Kind, Pacing, Title } from "../domain/types";

/**
 * TMDB adapter. The browser build never calls TMDB and never sees an API key.
 * Pass a server-side proxy fetcher if you want live titles in the same comparison engine.
 * The sample shelf in `catalog.ts` is what the app uses out of the box.
 */
export type TmdbResult = {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string;
  vote_average?: number;
  genre_ids?: number[];
  genres?: { id: number; name?: string }[];
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
  listed_in?: string[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_episodes?: number;
  poster_path?: string | null;
  vote_count?: number;
  tagline?: string;
  created_by?: { name?: string }[];
  credits?: { crew?: { job?: string; name?: string }[]; cast?: { name?: string; order?: number }[] };
  last_episode_to_air?: { runtime?: number };
  number_of_seasons?: number;
  watch?: {
    region?: string;
    link?: string;
    flatrate?: string[];
    free?: string[];
    ads?: string[];
    rent?: string[];
    buy?: string[];
  };
};

export type TmdbRequester = (path: string) => Promise<unknown>;

const GENRE_VIBES: Record<number, string> = {
  28: "Fast-paced",
  12: "Adventurous",
  35: "Witty",
  80: "Gritty",
  99: "Quiet",
  18: "Tender",
  10751: "Feel-good",
  14: "Epic",
  36: "Epic",
  27: "Dark",
  9648: "Mind-bending",
  10749: "Romantic",
  878: "Mind-bending",
  53: "Dark",
  10752: "Gritty",
  37: "Gritty",
  10759: "Fast-paced",
  10765: "Mind-bending",
  10762: "Feel-good",
};

const PALETTES: readonly [string, string][] = [
  ["#1c1c1c", "#3f6b52"],
  ["#6d1b4a", "#0e0e14"],
  ["#e8a317", "#2d5d8a"],
  ["#f0b4c8", "#7a3e6d"],
  ["#163a4a", "#d64545"],
  ["#c4a36a", "#6e4b2a"],
];

export function mapTmdbTitle(raw: TmdbResult, hint?: "movie" | "tv"): Title | null {
  const media = mediaOf(raw, hint);
  if (!raw.id || !media) return null;
  const name = (media === "movie" ? raw.title : raw.name)?.trim();
  if (!name) return null;

  const genreIds = raw.genre_ids ?? raw.genres?.map((genre) => genre.id) ?? [];
  const languageCode = raw.original_language ?? "en";
  const listedIn = listedNames(raw.listed_in);
  const kind = inferKind(media, genreIds, languageCode);
  const pacing = inferPacing(genreIds, sittingMinutes(raw, media));
  const score = scaleVote(raw.vote_average);
  const timing = timingFor(raw, media);
  const year = yearFrom(media === "movie" ? raw.release_date : raw.first_air_date);
  const overview = (raw.overview ?? "").replace(/\s+/g, " ").trim();
  const posterUrl = posterUrlFrom(raw.poster_path);
  const creator = creatorFrom(raw, media);

  return {
    id: `tmdb-${media}-${raw.id}`,
    name,
    year,
    kind,
    creator,
    language: languageName(languageCode),
    ...(listedIn ? { listedIn } : {}),
    synopsis: overview ? clip(overview, 320) : "No synopsis was included for this title.",
    highlights: detailLines(raw, creator),
    vibeTags: genreNames(raw) ?? inferVibes(genreIds),
    critic: score,
    audience: score,
    pacing,
    intensity: inferIntensity(pacing, genreIds),
    ...timing,
    palette: PALETTES[raw.id % PALETTES.length] ?? PALETTES[0],
    angle: 120 + (raw.id % 70),
    mark: markFrom(name),
    aliases: [],
    fits: inferFits(genreIds, pacing),
    ...(posterUrl ? { posterUrl } : {}),
    ...watchFields(raw),
  };
}

export function createTmdbSource(request: TmdbRequester) {
  return {
    label: "tmdb" as const,
    async search(query: string): Promise<Title[]> {
      const payload = (await request(`/search/multi?query=${encodeURIComponent(query)}`)) as { results?: TmdbResult[] };
      const results = Array.isArray(payload?.results) ? payload.results : [];
      return results
        .map((item) => mapTmdbTitle(item))
        .filter((item): item is Title => item !== null)
        .slice(0, 8);
    },
    async getMany(ids: readonly string[]): Promise<Title[]> {
      const titles: Title[] = [];
      for (const id of ids) {
        const parsed = /^tmdb-(movie|tv)-(\d+)$/.exec(id);
        if (!parsed) continue;
        const media = parsed[1] as "movie" | "tv";
        const raw = (await request(`/${media}/${parsed[2]}`)) as TmdbResult;
        const title = mapTmdbTitle(raw, media);
        if (title) titles.push(title);
      }
      return titles;
    },
  };
}

const LISTING = /^https:\/\/www\.themoviedb\.org\/[A-Za-z0-9/?=&%._~-]{1,180}$/;

function watchFields(raw: TmdbResult): { watch: NonNullable<Title["watch"]> } | Record<string, never> {
  const watch = raw.watch;
  if (!watch?.region || !WATCH_REGIONS.some((region) => region.code === watch.region)) return {};
  const names = (value: readonly string[] | undefined) =>
    (value ?? [])
      .map((name) => name.replace(/[\u0000-\u001F]/g, "").trim())
      .filter((name) => name.length > 0 && name.length <= 40)
      .filter((name, index, all) => all.indexOf(name) === index)
      .slice(0, 4);
  const stream = names([...(watch.flatrate ?? []), ...(watch.free ?? []), ...(watch.ads ?? [])]);
  const link = watch.link && LISTING.test(watch.link) ? watch.link : undefined;
  return {
    watch: {
      region: watch.region,
      stream,
      rent: names(watch.rent),
      buy: names(watch.buy),
      ...(link ? { link } : {}),
    },
  };
}

function listedNames(codes: readonly string[] | undefined): string {
  if (!codes || codes.length === 0) return "";
  return codes.map((code) => languageName(code)).join(", ");
}

function mediaOf(raw: TmdbResult, hint?: "movie" | "tv"): "movie" | "tv" | null {
  if (raw.media_type && raw.media_type !== "movie" && raw.media_type !== "tv") return null;
  if (hint) return hint;
  if (raw.media_type === "movie" || raw.media_type === "tv") return raw.media_type;
  if (raw.title && !raw.name) return "movie";
  if (raw.name && !raw.title) return "tv";
  return null;
}

function inferKind(media: "movie" | "tv", genreIds: readonly number[], language: string): Kind {
  const animated = genreIds.includes(16) || genreIds.includes(10762);
  if (language === "ja" && animated) return "anime";
  if (animated) return "animation";
  if (media === "tv") return "series";
  return "movie";
}

function inferVibes(genreIds: readonly number[]): string[] {
  const vibes: string[] = [];
  for (const id of genreIds) {
    const vibe = GENRE_VIBES[id];
    if (vibe && !vibes.includes(vibe)) vibes.push(vibe);
    if (vibes.length === 4) break;
  }
  return vibes.length > 0 ? vibes : ["Steady"];
}

function inferPacing(genreIds: readonly number[], sitting: number): Pacing {
  const hard = genreIds.some((id) => [27, 53, 9648, 878, 10752, 80].includes(id));
  const soft = genreIds.some((id) => [35, 10751, 10762, 10402].includes(id));
  if (hard && sitting >= 50) return "demanding";
  if (soft && sitting > 0 && sitting <= 40) return "background";
  if (soft) return "easy";
  if (sitting >= 140) return "demanding";
  return "engaged";
}

function inferFits(genreIds: readonly number[], pacing: Pacing): Fits {
  const has = (id: number) => genreIds.includes(id);
  let focus = pacing === "demanding" ? 86 : pacing === "engaged" ? 64 : 40;
  let relaxed = pacing === "background" ? 92 : pacing === "easy" ? 78 : pacing === "engaged" ? 46 : 24;
  const emotional = has(18) || has(10749) ? 84 : 48;
  let date = has(10749) ? 90 : has(35) ? 64 : 46;
  let group = has(35) || has(10751) || has(12) ? 88 : 52;
  if (has(27) || has(53)) {
    relaxed = Math.min(relaxed, 28);
    group = Math.max(40, group - 10);
    date = Math.min(date, 40);
    focus = Math.max(focus, 80);
  }
  return { focus, relaxed, emotional, solo: 70, date, group };
}

function inferIntensity(pacing: Pacing, genreIds: readonly number[]): number {
  let value = { background: 2, easy: 4, engaged: 6, demanding: 8 }[pacing];
  if (genreIds.includes(27) || genreIds.includes(10752)) value = Math.min(10, value + 1);
  return value;
}

function genreNames(raw: TmdbResult): string[] | null {
  const names = (raw.genres ?? [])
    .map((genre) => genre.name?.replace(/[\u0000-\u001F]/g, "").trim() ?? "")
    .filter((name) => name.length > 0 && name.length <= 32);
  const unique = names.filter((name, index) => names.indexOf(name) === index).slice(0, 4);
  return unique.length > 0 ? unique : null;
}

function detailLines(raw: TmdbResult, creator: string): [string, string] {
  const ratings =
    raw.vote_count && raw.vote_count > 0
      ? `TMDB user score, from ${groupCount(raw.vote_count)} ratings.`
      : "TMDB user score is the only rating in this feed, so both axes match.";
  const cast = (raw.credits?.cast ?? [])
    .map((person) => person.name?.replace(/[\u0000-\u001F]/g, "").trim() ?? "")
    .filter(Boolean)
    .slice(0, 3);
  const seasons = raw.number_of_seasons && raw.number_of_seasons > 0 ? `${raw.number_of_seasons} seasons listed.` : "";
  const people = cast.length > 0 ? `With ${cast.join(", ")}.` : seasons || (creator === "Listed on TMDB" ? "Vibe and mood fits are inferred from genres." : creator);
  return [ratings, people];
}

function groupCount(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function creatorFrom(raw: TmdbResult, media: "movie" | "tv"): string {
  const names =
    media === "tv"
      ? (raw.created_by ?? []).map((person) => person.name)
      : (raw.credits?.crew ?? []).filter((person) => person.job === "Director").map((person) => person.name);
  const cleaned = names
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.replace(/[\u0000-\u001F]/g, "").trim())
    .filter(Boolean)
    .slice(0, 2);
  return cleaned.length > 0 ? cleaned.join(", ") : "Listed on TMDB";
}

export function posterUrlFrom(path: string | null | undefined): string | undefined {
  if (!path || path.includes("..") || path.includes("//") || !/^\/[A-Za-z0-9._-]{1,180}$/.test(path)) return undefined;
  return `https://image.tmdb.org/t/p/w342${path}`;
}

function sittingMinutes(raw: TmdbResult, media: "movie" | "tv"): number {
  if (media === "movie") return raw.runtime && raw.runtime > 0 ? raw.runtime : 0;
  return raw.episode_run_time?.find((value) => value > 0) ?? 0;
}

function timingFor(raw: TmdbResult, media: "movie" | "tv"): Pick<Title, "runtimeMinutes" | "approximate" | "episodeCount" | "episodeMinutes"> {
  if (media === "movie") {
    const runtime = raw.runtime && raw.runtime > 0 ? raw.runtime : 0;
    return { runtimeMinutes: runtime, approximate: runtime === 0 };
  }
  const episodeMinutes = raw.episode_run_time?.find((value) => value > 0) ?? raw.last_episode_to_air?.runtime ?? 0;
  const episodeCount = raw.number_of_episodes && raw.number_of_episodes > 0 ? raw.number_of_episodes : 0;
  if (episodeMinutes && episodeCount) {
    return {
      episodeMinutes,
      episodeCount,
      runtimeMinutes: episodeMinutes * episodeCount,
      approximate: true,
    };
  }
  return { runtimeMinutes: 0, approximate: true };
}

function scaleVote(vote: number | undefined): number {
  if (!vote || vote <= 0) return 60;
  return Math.max(0, Math.min(100, Math.round(vote * 10)));
}

function yearFrom(value: string | undefined): number {
  const year = Number(value?.slice(0, 4));
  return Number.isFinite(year) && year > 1800 ? year : 0;
}

function markFrom(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 1) return (words[0] ?? "TM").slice(0, 2).toUpperCase();
  const letters = words
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
  return (letters || "TM").toUpperCase().slice(0, 2);
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  const sliced = value.slice(0, max - 1);
  const word = sliced.lastIndexOf(" ");
  return `${(word > 40 ? sliced.slice(0, word) : sliced).trim()}…`;
}
