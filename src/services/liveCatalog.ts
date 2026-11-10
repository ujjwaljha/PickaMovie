import type { AudioMatch } from "../domain/languages";
import type { Title } from "../domain/types";
import { mapTmdbTitle, type TmdbResult } from "./tmdb";

export type CatalogMode = "live" | "shelf";

type Envelope = {
  configured?: boolean;
  payload?: unknown;
};

export async function probeCatalog(signal?: AbortSignal): Promise<CatalogMode> {
  const body = await read("/api/catalog?op=status", signal);
  return body?.configured === true ? "live" : "shelf";
}

export async function searchLive(query: string, options?: { language?: string; audio?: AudioMatch }, signal?: AbortSignal): Promise<Title[] | null> {
  const params = new URLSearchParams({ op: "search", q: query });
  if (options?.language) params.set("lang", options.language);
  if (options?.language && options.audio === "listed") params.set("audio", "listed");
  const body = await read(`/api/catalog?${params.toString()}`, signal);
  if (!body) return null;
  if (body.configured !== true) return null;
  return titlesFromPayload(body.payload).slice(0, 16);
}

export async function loadLanguage(language: string, signal?: AbortSignal): Promise<Title[] | null> {
  const body = await read(`/api/catalog?op=language&lang=${encodeURIComponent(language)}`, signal);
  if (!body || body.configured !== true) return null;
  return titlesFromPayload(body.payload);
}

export async function loadBrowse(signal?: AbortSignal): Promise<Title[] | null> {
  const body = await read("/api/catalog?op=browse", signal);
  if (!body || body.configured !== true) return null;
  return titlesFromPayload(body.payload);
}

export async function loadLiveTitles(ids: readonly string[], signal?: AbortSignal, region?: string): Promise<Title[]> {
  const found: Title[] = [];
  for (const id of ids) {
    const parsed = /^tmdb-(movie|tv)-(\d{1,10})$/.exec(id);
    if (!parsed) continue;
    const media = parsed[1];
    const params = new URLSearchParams({ op: "title", media, id: parsed[2] });
    if (region) params.set("region", region);
    const body = await read(`/api/catalog?${params.toString()}`, signal);
    if (!body || body.configured !== true) continue;
    const title = mapTmdbTitle(asResult(body.payload), media === "tv" ? "tv" : "movie");
    if (title) found.push(title);
  }
  return found;
}

export async function recommendLive(ids: readonly string[], signal?: AbortSignal): Promise<Title[] | null> {
  const pool: Title[] = [];
  let sawLive = false;
  for (const id of ids) {
    const parsed = /^tmdb-(movie|tv)-(\d{1,10})$/.exec(id);
    if (!parsed) continue;
    const media = parsed[1];
    const body = await read(`/api/catalog?op=similar&media=${media}&id=${parsed[2]}`, signal);
    if (!body) return null;
    if (body.configured !== true) return null;
    sawLive = true;
    pool.push(...titlesFromPayload(body.payload));
  }
  if (!sawLive) return null;
  const seen = new Set<string>();
  return pool.filter((title) => {
    if (seen.has(title.id) || ids.includes(title.id)) return false;
    seen.add(title.id);
    return true;
  });
}

function titlesFromPayload(payload: unknown): Title[] {
  const record = asRecord(payload);
  const results = Array.isArray(record?.results) ? record.results : [];
  return results.map((item) => mapTmdbTitle(asResult(item))).filter((item): item is Title => item !== null);
}

async function read(path: string, signal?: AbortSignal, attempt = 0): Promise<Envelope | null> {
  try {
    const response = await fetch(path, { signal, headers: { accept: "application/json" } });
    const body = (await response.json()) as Envelope;
    if (!body || typeof body !== "object") return null;
    if (body.configured === false) return { configured: false };
    if (response.status === 429 && attempt === 0) return read(path, signal, 1);
    if (!response.ok) return null;
    return body;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): { results?: unknown[] } | null {
  if (!value || typeof value !== "object") return null;
  return value as { results?: unknown[] };
}

function asResult(value: unknown): TmdbResult {
  if (!value || typeof value !== "object") return {};
  return value as TmdbResult;
}
