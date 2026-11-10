import { WATCH_REGIONS } from "../domain/regions";
import type { Kind, Pacing, Title } from "../domain/types";
import { posterUrlFrom } from "./tmdb";

export const LIBRARY_KEY = "what2watch.library.v1";

const KINDS = new Set<Kind>(["movie", "series", "anime", "animation"]);
const PACING = new Set<Pacing>(["background", "easy", "engaged", "demanding"]);

export function loadLibrary(storage: Pick<Storage, "getItem"> | null): Record<string, Title> {
  if (!storage) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(LIBRARY_KEY) ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const library: Record<string, Title> = {};
    for (const value of Object.values(parsed)) {
      const title = sanitizeStoredTitle(value);
      if (title) library[title.id] = title;
    }
    return library;
  } catch {
    return {};
  }
}

export function saveLibrary(storage: Pick<Storage, "setItem">, library: Record<string, Title>): void {
  const safe: Record<string, Title> = {};
  for (const title of Object.values(library)) {
    const cleaned = sanitizeStoredTitle(title);
    if (cleaned) safe[cleaned.id] = cleaned;
  }
  storage.setItem(LIBRARY_KEY, JSON.stringify(safe));
}

export function remember(current: Record<string, Title>, incoming: readonly Title[], keep: readonly string[] = []): Record<string, Title> {
  const next = { ...current };
  for (const title of incoming) {
    const cleaned = sanitizeStoredTitle(title);
    if (cleaned) next[cleaned.id] = cleaned;
  }
  const keepSet = new Set(keep);
  const extra = Object.keys(next).filter((id) => !keepSet.has(id));
  while (Object.keys(next).length > 48 && extra.length > 0) {
    const id = extra.shift();
    if (id) delete next[id];
  }
  return next;
}

function sanitizeStoredTitle(raw: unknown): Title | null {
  if (!raw || typeof raw !== "object") return null;
  const title = raw as Title;
  if (!/^tmdb-(movie|tv)-\d{1,10}$/.test(title.id)) return null;
  if (typeof title.name !== "string" || !title.name.trim() || title.name.length > 180) return null;
  if (!KINDS.has(title.kind) || !PACING.has(title.pacing)) return null;
  if (!title.fits || typeof title.fits !== "object") return null;
  const posterUrl = posterUrlFrom(posterPath(title.posterUrl));
  const watch = cleanWatch(title.watch);
  const next: Title = { ...title };
  delete next.posterUrl;
  delete next.watch;
  return { ...next, ...(posterUrl ? { posterUrl } : {}), ...(watch ? { watch } : {}) };
}

const LISTING = /^https:\/\/www\.themoviedb\.org\/[A-Za-z0-9/?=&%._~-]{1,180}$/;

function cleanWatch(value: unknown): Title["watch"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const watch = value as NonNullable<Title["watch"]>;
  if (!WATCH_REGIONS.some((region) => region.code === watch.region)) return undefined;
  const link = typeof watch.link === "string" && LISTING.test(watch.link) ? watch.link : undefined;
  return { region: watch.region, stream: cleanNames(watch.stream), rent: cleanNames(watch.rent), buy: cleanNames(watch.buy), ...(link ? { link } : {}) };
}

function cleanNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= 40).slice(0, 4);
}

function posterPath(url: string | undefined): string | undefined {
  const prefix = "https://image.tmdb.org/t/p/w342";
  if (!url?.startsWith(prefix)) return undefined;
  return url.slice(prefix.length);
}
