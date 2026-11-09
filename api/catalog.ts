/**
 * Allowlisted TMDB proxy. This file is the published server route.
 * It imports nothing from the app, so the host can run it on its own.
 * The key stays in TMDB_API_KEY and is never written into a response.
 */

const TMDB_ORIGIN = "https://api.themoviedb.org";
/** Fresh upstream calls per minute for the whole app. A repeated query is served from cache and does not count. */
export const CATALOG_MINUTE_LIMIT = 20;
/** Fresh upstream calls per minute for one browser. Forged cookies share the anonymous bucket. */
export const CATALOG_CLIENT_MINUTE_LIMIT = 12;
/** Languages a visitor can ask for. The same codes live in the app's language list. */
export const CATALOG_LANGUAGE_CODES = ["en", "hi", "ta", "te", "ml", "kn", "bn", "mr", "ja", "ko", "zh", "es", "fr", "de", "ar", "pt", "it", "th", "ru"] as const;
const LANGUAGE_CODES = new Set<string>(CATALOG_LANGUAGE_CODES);
const LISTED_LOOKUPS = 4;
const HOUR_LIMIT = 200;
const CLIENT_HOUR_LIMIT = 60;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_CLIENTS = 200;

type Saved = { body: { configured: true; payload: unknown }; cacheSeconds: number; expires: number };
type Window = { count: number; reset: number };
type ClientBucket = { minute: Window; hour: Window; seen: number };

const cache = new Map<string, Saved>();
const inflight = new Map<string, Promise<Saved | null>>();
const clients = new Map<string, ClientBucket>();
const minute: Window = { count: 0, reset: 0 };
const hour: Window = { count: 0, reset: 0 };
let signingKey: CryptoKey | null = null;

const BROWSE_PATHS = [
  "/3/trending/all/week?language=en-US",
  "/3/movie/popular?language=en-US&include_adult=false",
  "/3/tv/popular?language=en-US",
] as const;

type Env = { TMDB_API_KEY?: string };

type NodeRequest = {
  url?: string;
  method?: string;
  headers?: { host?: string | string[]; cookie?: string | string[] };
};

type NodeResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

type Raw = Record<string, unknown>;

export function resetCatalogLimits(): void {
  cache.clear();
  inflight.clear();
  minute.count = 0;
  minute.reset = 0;
  hour.count = 0;
  hour.reset = 0;
  clients.clear();
}

function readKey(): string {
  const env = (globalThis as { process?: { env?: Env } }).process?.env;
  return env?.TMDB_API_KEY?.trim() ?? "";
}

export function allowedTmdbPath(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  const op = url.searchParams.get("op");
  if (op === "status" || op === "browse") return "";
  if (op === "language") {
    const lang = languageCode(url.searchParams.get("lang"));
    const audio = audioMode(url.searchParams.get("audio"));
    if (!lang || audio !== "original") return null;
    return "";
  }
  if (op === "search") {
    const query = cleanQuery(url.searchParams.get("q")).toLowerCase();
    if (query.length < 2) return null;
    if (languageCode(url.searchParams.get("lang")) === null || audioMode(url.searchParams.get("audio")) === null) return null;
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

  const visitor = await identify(request);
  const stamp = visitor.fresh ? cookieHeader(visitor.token, request.url.startsWith("https:")) : undefined;
  const send = (body: unknown, status: number, cacheSeconds = 0) => respond(body, status, cacheSeconds, stamp);

  const url = requestUrl(request);
  const op = url.searchParams.get("op");
  const path = allowedTmdbPath(url.toString());
  if (path === null) return send({ configured: true, error: "query" }, 400);
  if (op === "status") return send({ configured: true }, 200);

  const lang = languageCode(url.searchParams.get("lang")) ?? "";
  const audio = audioMode(url.searchParams.get("audio")) ?? "original";
  const id = op === "browse" ? "browse" : op === "language" ? `language:${lang}` : op === "search" ? searchCacheId(path, lang, audio) : path;
  const weight = op === "browse" ? 3 : op === "language" ? 2 : op === "search" && lang && audio === "listed" ? 1 + LISTED_LOOKUPS : 1;
  const ready = recall(id);
  if (ready) return send(ready.body, 200, ready.cacheSeconds);

  const pending = inflight.get(id);
  if (pending) {
    const shared = await pending;
    if (!shared) return send({ configured: true, error: "upstream" }, 502);
    return send(shared.body, 200, shared.cacheSeconds);
  }

  if (tooMany(visitor.id, weight)) return send({ configured: true, error: "rate" }, 429);

  const job = loadCatalog(op ?? "", key, path, lang, audio).then((saved) => {
    if (saved) remember(id, saved);
    return saved;
  });
  inflight.set(id, job);
  try {
    const saved = await job;
    if (!saved) return send({ configured: true, error: "upstream" }, 502);
    return send(saved.body, 200, saved.cacheSeconds);
  } finally {
    inflight.delete(id);
  }
}

async function loadCatalog(op: string, key: string, path: string, lang: string, audio: "original" | "listed"): Promise<Saved | null> {
  if (op === "browse") {
    const results = await browseResults(key, BROWSE_PATHS);
    if (!results) return null;
    return { body: { configured: true, payload: { results } }, cacheSeconds: 3600, expires: 0 };
  }
  if (op === "language") {
    const results = await browseResults(key, languagePaths(lang));
    if (!results) return null;
    return { body: { configured: true, payload: { results } }, cacheSeconds: 3600, expires: 0 };
  }
  const payload = await tmdb(key, path);
  if (!payload) return null;
  if (op === "title") {
    const slim = slimResult(payload);
    if (!slim) return null;
    return { body: { configured: true, payload: slim }, cacheSeconds: 3600, expires: 0 };
  }
  if (op === "search") {
    const results = await searchResults(key, payload, lang, audio);
    if (!results) return null;
    return { body: { configured: true, payload: { results } }, cacheSeconds: 300, expires: 0 };
  }
  const rows = Array.isArray(payload.results) ? payload.results : [];
  const results = rows.map(slimResult).filter((item): item is Raw => item !== null).slice(0, 12);
  return { body: { configured: true, payload: { results } }, cacheSeconds: 1800, expires: 0 };
}

async function searchResults(key: string, payload: Raw, lang: string, audio: "original" | "listed"): Promise<Raw[] | null> {
  const rows = Array.isArray(payload.results) ? payload.results : [];
  const slimmed = rows.map(slimResult).filter((item): item is Raw => item !== null);
  if (!lang) return slimmed.slice(0, 16);
  if (audio === "original") return slimmed.filter((item) => item.original_language === lang).slice(0, 16);
  const listed: Raw[] = [];
  let lookups = 0;
  for (const item of slimmed) {
    if (listed.length === 8) break;
    if (item.original_language === lang) continue;
    if (lookups >= LISTED_LOOKUPS) break;
    if (typeof item.id !== "number" || (item.media_type !== "movie" && item.media_type !== "tv")) continue;
    lookups += 1;
    const translations = await tmdb(key, `/3/${item.media_type}/${item.id}/translations`);
    const codes = translationCodes(translations).filter((code) => code !== item.original_language);
    if (!codes.includes(lang)) continue;
    item.listed_in = codes.slice(0, 6);
    listed.push(item);
  }
  return listed;
}

function languagePaths(lang: string): readonly string[] {
  return [
    `/3/discover/movie?with_original_language=${lang}&sort_by=popularity.desc&include_adult=false&language=en-US`,
    `/3/discover/tv?with_original_language=${lang}&sort_by=popularity.desc&include_adult=false&language=en-US`,
  ];
}

function searchCacheId(path: string, lang: string, audio: "original" | "listed"): string {
  if (!lang) return path;
  return `${path}|${audio}|${lang}`;
}

function languageCode(value: string | null): string | null {
  if (!value) return "";
  const code = value.trim().toLowerCase();
  if (!LANGUAGE_CODES.has(code)) return null;
  return code;
}

function audioMode(value: string | null): "original" | "listed" | null {
  if (!value || value === "original") return "original";
  if (value === "listed") return "listed";
  return null;
}

function translationCodes(payload: Raw | null): string[] {
  const rows = payload && Array.isArray(payload.translations) ? payload.translations : [];
  const codes: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const code = text((row as Raw).iso_639_1, 8)?.toLowerCase();
    if (!code || code.length !== 2 || !LANGUAGE_CODES.has(code) || codes.includes(code)) continue;
    codes.push(code);
  }
  return codes;
}

async function browseResults(key: string, paths: readonly string[]): Promise<Raw[] | null> {
  const batches = await Promise.all(paths.map((path) => tmdb(key, path)));
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
  if (results.length === 0 && batches.every((payload) => !payload)) return null;
  return results;
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

function recall(id: string): Saved | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() >= entry.expires) {
    cache.delete(id);
    return null;
  }
  return entry;
}

function remember(id: string, saved: Saved): void {
  if (cache.size >= 80) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(id, { ...saved, expires: Date.now() + saved.cacheSeconds * 1000 });
}

function tooMany(client: string, weight: number): boolean {
  const now = Date.now();
  roll(minute, now, MINUTE_MS);
  roll(hour, now, HOUR_MS);
  if (minute.count + weight > CATALOG_MINUTE_LIMIT || hour.count + weight > HOUR_LIMIT) return true;
  const bucket = takeClient(client, now);
  roll(bucket.minute, now, MINUTE_MS);
  roll(bucket.hour, now, HOUR_MS);
  if (bucket.minute.count + weight > CATALOG_CLIENT_MINUTE_LIMIT || bucket.hour.count + weight > CLIENT_HOUR_LIMIT) return true;
  minute.count += weight;
  hour.count += weight;
  bucket.minute.count += weight;
  bucket.hour.count += weight;
  return false;
}

function roll(window: Window, now: number, span: number): void {
  if (now < window.reset) return;
  window.count = 0;
  window.reset = now + span;
}

function takeClient(id: string, now: number): ClientBucket {
  const found = clients.get(id);
  if (found) {
    found.seen = now;
    return found;
  }
  if (id !== "anon" && clients.size >= MAX_CLIENTS && !dropIdleClient(now)) return takeClient("anon", now);
  const created: ClientBucket = { minute: { count: 0, reset: 0 }, hour: { count: 0, reset: 0 }, seen: now };
  clients.set(id, created);
  return created;
}

function dropIdleClient(now: number): boolean {
  let drop: string | null = null;
  let seen = Infinity;
  for (const [key, bucket] of clients) {
    if (key === "anon" || bucket.seen >= seen) continue;
    if (bucket.minute.count > 0 && now < bucket.minute.reset) continue;
    drop = key;
    seen = bucket.seen;
  }
  if (!drop) return false;
  clients.delete(drop);
  return true;
}

async function identify(request: Request): Promise<{ id: string; token: string; fresh: boolean }> {
  const presented = readCookie(request.headers.get("cookie"), "w2w");
  const id = await verifiedId(presented);
  if (id && presented) return { id, token: presented, fresh: false };
  return { id: "anon", token: await issueToken(), fresh: true };
}

async function verifiedId(token: string | null): Promise<string | null> {
  if (!token) return null;
  const match = /^([0-9a-f]{16})\.([0-9a-f]{32})$/.exec(token);
  if (!match) return null;
  const expected = await sign(match[1]);
  return sameText(expected, match[2]) ? match[1] : null;
}

async function issueToken(): Promise<string> {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const id = hex(bytes);
  return `${id}.${await sign(id)}`;
}

async function sign(id: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(id)));
  return hex(mac).slice(0, 32);
}

async function hmacKey(): Promise<CryptoKey> {
  if (signingKey) return signingKey;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  signingKey = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return signingKey;
}

function cookieHeader(token: string, secure: boolean): string {
  const parts = ["w2w=" + token, "HttpOnly", "SameSite=Lax", "Path=/api/catalog", "Max-Age=86400"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1 || trimmed.slice(0, eq) !== name) continue;
    return trimmed.slice(eq + 1);
  }
  return null;
}

function sameText(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanQuery(value: string | null): string {
  if (!value) return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
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
      const cookie = candidate.headers.get("cookie");
      return new Request(new URL(candidate.url || "/", "https://localhost"), {
        method: candidate.method || "GET",
        headers: cookie ? { cookie } : undefined,
      });
    }
  }
  const node = req as NodeRequest;
  const hostHeader = node.headers?.host;
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader) || "localhost";
  const raw = node.url || "/api/catalog";
  const absolute = raw.startsWith("http") ? raw : `https://${host}${raw.startsWith("/") ? "" : "/"}${raw}`;
  const cookieHeaderValue = node.headers?.cookie;
  const cookie = Array.isArray(cookieHeaderValue) ? cookieHeaderValue[0] : cookieHeaderValue;
  return new Request(absolute, { method: node.method || "GET", headers: cookie ? { cookie } : undefined });
}

function respond(body: unknown, status: number, cacheSeconds = 0, cookie?: string): Response {
  const cacheControl = cookie && cacheSeconds > 0 ? `private, max-age=${cacheSeconds}` : cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store";
  const headers: Record<string, string> = { "cache-control": cacheControl };
  if (cookie) headers["set-cookie"] = cookie;
  return Response.json(body, { status, headers });
}
