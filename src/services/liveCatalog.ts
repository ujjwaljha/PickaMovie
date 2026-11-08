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

export async function searchLive(query: string, signal?: AbortSignal): Promise<Title[] | null> {
  const body = await read(`/api/catalog?op=search&q=${encodeURIComponent(query)}`, signal);
  if (!body) return null;
  if (body.configured !== true) return null;
  return titlesFromPayload(body.payload).slice(0, 8);
}

export async function loadLiveTitles(ids: readonly string[], signal?: AbortSignal): Promise<Title[]> {
  const found: Title[] = [];
  for (const id of ids) {
    const parsed = /^tmdb-(movie|tv)-(\d{1,10})$/.exec(id);
    if (!parsed) continue;
    const media = parsed[1];
    const body = await read(`/api/catalog?op=title&media=${media}&id=${parsed[2]}`, signal);
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

async function read(path: string, signal?: AbortSignal): Promise<Envelope | null> {
  try {
    const response = await fetch(path, { signal, headers: { accept: "application/json" } });
    const body = (await response.json()) as Envelope;
    if (!body || typeof body !== "object") return null;
    if (body.configured === false) return { configured: false };
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
