/**
 * Allowlisted TMDB proxy. This file is the published server route.
 * It imports nothing from the app, so the host can run it on its own.
 * The key stays in TMDB_API_KEY and is never written into a response.
 */

const TMDB_ORIGIN = "https://api.themoviedb.org";
/** Shared by every caller. A client-supplied address must not open another window. */
export const CATALOG_MINUTE_LIMIT = 120;
const WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; reset: number }>();

const BROWSE_PATHS = [
  "/3/trending/all/week?language=en-US",
  "/3/movie/popular?language=en-US&include_adult=false",
  "/3/tv/popular?language=en-US",
] as const;

type Env = { TMDB_API_KEY?: string };

type NodeRequest = {
  url?: string;
  method?: string;
  headers?: { host?: string | string[] };
};

type NodeResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

type Raw = Record<string, unknown>;

export function resetCatalogLimits(): void {
  buckets.clear();
}

function readKey(): string {
  const env = (globalThis as { process?: { env?: Env } }).process?.env;
  return env?.TMDB_API_KEY?.trim() ?? "";
}

export function allowedTmdbPath(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  const op = url.searchParams.get("op");
  if (op === "status" || op === "browse") return "";
  if (op === "search") {
    const query = cleanQuery(url.searchParams.get("q"));
    if (!query) return null;
    return `/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US`;
  }
  if (op !== "title" && op !== "similar") return null;
  const media = url.searchParams.get("media");
  const id = url.searchParams.get("id");
  if ((media !== "movie" && media !== "tv") || !id || !/^\d{1,10}$/.test(id)) return null;
  if (op === "title") return `/3/${media}/${id}?append_to_response=credits&language=en-US`;
  return `/3/${media}/${id}/recommendations?language=en-US`;
}

export async function GET(request: Request): Promise<Response> {
  try {
    return await route(request);
  } catch {
    return respond({ configured: false }, 500);
  }
}

export default async function handler(req: Request | NodeRequest, res?: NodeResponse): Promise<Response | undefined> {
  try {
    const request = asRequest(req);
    const response = await GET(request);
    if (!res || typeof res.end !== "function") return response;
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(await response.text());
    return;
  } catch {
    if (res && typeof res.end === "function") {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify({ configured: false }));
      return;
    }
    return respond({ configured: false }, 500);
  }
}

async function route(request: Request): Promise<Response> {
  const key = readKey();
  if (!key) return respond({ configured: false }, 200);

  const url = requestUrl(request);
  const op = url.searchParams.get("op");
  const path = allowedTmdbPath(url.toString());
  if (path === null) return respond({ configured: true, error: "query" }, 400);
  if (op === "status") return respond({ configured: true }, 200);
  if (tooMany(op === "browse" ? 3 : 1)) return respond({ configured: true, error: "rate" }, 429);

  if (op === "browse") return browse(key);

  const payload = await tmdb(key, path);
  if (!payload) return respond({ configured: true, error: "upstream" }, 502);
  if (op === "title") {
    const slim = slimResult(payload);
    if (!slim) return respond({ configured: true, error: "upstream" }, 502);
    return respond({ configured: true, payload: slim }, 200, 300);
  }
  const rows = Array.isArray(payload.results) ? payload.results : [];
  const results = rows.map(slimResult).filter((item): item is Raw => item !== null).slice(0, op === "search" ? 16 : 12);
  return respond({ configured: true, payload: { results } }, 200, 300);
}

async function browse(key: string): Promise<Response> {
  const batches = await Promise.all(BROWSE_PATHS.map((path) => tmdb(key, path)));
  const results: Raw[] = [];
  const seen = new Set<string>();
  for (const payload of batches) {
    const rows = payload && Array.isArray(payload.results) ? payload.results : [];
    for (const row of rows) {
      const slim = slimResult(row);
      if (!slim || typeof slim.id !== "number" || typeof slim.media_type !== "string") continue;
      const stamp = `${slim.media_type}-${slim.id}`;
      if (seen.has(stamp)) continue;
      seen.add(stamp);
      results.push(slim);
      if (results.length === 40) break;
    }
    if (results.length === 40) break;
  }
  if (results.length === 0 && batches.every((payload) => !payload)) return respond({ configured: true, error: "upstream" }, 502);
  return respond({ configured: true, payload: { results } }, 200, 3600);
}

async function tmdb(key: string, path: string): Promise<Raw | null> {
  const target = new URL(`${TMDB_ORIGIN}${path}`);
  const headers: Record<string, string> = { accept: "application/json" };
  if (key.startsWith("ey")) headers.authorization = `Bearer ${key}`;
  else target.searchParams.set("api_key", key);
  try {
    const upstream = await fetch(target, { headers, redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) return null;
    const payload: unknown = await upstream.json();
    return payload && typeof payload === "object" ? (payload as Raw) : null;
  } catch {
    return null;
  }
}

function slimResult(value: unknown): Raw | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Raw;
  if (typeof raw.id !== "number") return null;
  const media = mediaOf(raw);
  if (!media) return null;
  const crew = people(raw.credits, "crew")
    .filter((person) => person.job === "Director" || person.job === "Creator")
    .slice(0, 3);
  const cast = people(raw.credits, "cast").slice(0, 4);
  const slim: Raw = {
    id: raw.id,
    media_type: media,
    title: text(raw.title, 180),
    name: text(raw.name, 180),
    overview: text(raw.overview, 600),
    vote_average: number(raw.vote_average),
    vote_count: number(raw.vote_count),
    genre_ids: numberList(raw.genre_ids).slice(0, 8),
    release_date: text(raw.release_date, 20),
    first_air_date: text(raw.first_air_date, 20),
    original_language: text(raw.original_language, 8),
    poster_path: posterPath(raw.poster_path),
  };
  const genres = genreList(raw.genres);
  if (genres.length > 0) slim.genres = genres;
  const runtime = number(raw.runtime);
  if (runtime) slim.runtime = runtime;
  const episodes = numberList(raw.episode_run_time);
  if (episodes.length > 0) slim.episode_run_time = episodes.slice(0, 4);
  const episodeCount = number(raw.number_of_episodes);
  if (episodeCount) slim.number_of_episodes = episodeCount;
  const seasons = number(raw.number_of_seasons);
  if (seasons) slim.number_of_seasons = seasons;
  const tagline = text(raw.tagline, 180);
  if (tagline) slim.tagline = tagline;
  const createdBy = created(raw.created_by);
  if (createdBy.length > 0) slim.created_by = createdBy;
  if (crew.length > 0 || cast.length > 0) slim.credits = { ...(crew.length > 0 ? { crew } : {}), ...(cast.length > 0 ? { cast } : {}) };
  const last = lastEpisode(raw.last_episode_to_air);
  if (last) slim.last_episode_to_air = last;
  return slim;
}

function mediaOf(raw: Raw): "movie" | "tv" | null {
  if (raw.media_type === "movie" || raw.media_type === "tv") return raw.media_type;
  if (raw.media_type) return null;
  if (typeof raw.title === "string" && typeof raw.name !== "string") return "movie";
  if (typeof raw.name === "string" && typeof raw.title !== "string") return "tv";
  return null;
}

function people(credits: unknown, key: "crew" | "cast"): { job?: string; name: string; order?: number }[] {
  if (!credits || typeof credits !== "object") return [];
  const rows = (credits as Raw)[key];
  if (!Array.isArray(rows)) return [];
  const found: { job?: string; name: string; order?: number }[] = [];
  for (const person of rows) {
    if (!person || typeof person !== "object") continue;
    const record = person as Raw;
    const name = text(record.name, 80);
    if (!name) continue;
    const job = text(record.job, 40);
    const order = number(record.order);
    found.push({ ...(job ? { job } : {}), name, ...(order !== undefined ? { order } : {}) });
  }
  return found;
}

function genreList(value: unknown): { id: number; name: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((genre) => {
      if (!genre || typeof genre !== "object") return null;
      const record = genre as Raw;
      const name = text(record.name, 32);
      if (typeof record.id !== "number" || !name) return null;
      return { id: record.id, name };
    })
    .filter((genre): genre is { id: number; name: string } => genre !== null)
    .slice(0, 6);
}

function created(value: unknown): { name: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((person) => {
      if (!person || typeof person !== "object") return null;
      const name = text((person as Raw).name, 80);
      return name ? { name } : null;
    })
    .filter((person): person is { name: string } => person !== null)
    .slice(0, 2);
}

function lastEpisode(value: unknown): { runtime: number } | null {
  if (!value || typeof value !== "object") return null;
  const runtime = number((value as Raw).runtime);
  return runtime ? { runtime } : null;
}

function posterPath(value: unknown): string | null {
  if (typeof value !== "string" || value.includes("..") || value.includes("//") || !/^\/[A-Za-z0-9._-]{1,180}$/.test(value)) return null;
  return value;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function tooMany(weight: number): boolean {
  const now = Date.now();
  const slot = buckets.get("shared");
  if (!slot || now >= slot.reset) {
    buckets.set("shared", { count: weight, reset: now + WINDOW_MS });
    return weight > CATALOG_MINUTE_LIMIT;
  }
  slot.count += weight;
  return slot.count > CATALOG_MINUTE_LIMIT;
}

function cleanQuery(value: string | null): string {
  if (!value) return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 80);
}

function requestUrl(request: Request): URL {
  try {
    return new URL(request.url);
  } catch {
    return new URL("/api/catalog", "https://localhost");
  }
}

function asRequest(req: Request | NodeRequest): Request {
  if (typeof (req as Request).headers?.get === "function" && typeof (req as Request).url === "string") {
    const candidate = req as Request;
    try {
      new URL(candidate.url);
      return candidate;
    } catch {
      return new Request(new URL(candidate.url || "/", "https://localhost"), { method: candidate.method || "GET" });
    }
  }
  const node = req as NodeRequest;
  const hostHeader = node.headers?.host;
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader) || "localhost";
  const raw = node.url || "/api/catalog";
  const absolute = raw.startsWith("http") ? raw : `https://${host}${raw.startsWith("/") ? "" : "/"}${raw}`;
  return new Request(absolute, { method: node.method || "GET" });
}

function respond(body: unknown, status: number, cacheSeconds = 0): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store" },
  });
}
