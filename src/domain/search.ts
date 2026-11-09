import type { AudioMatch } from "./languages";
import { languageName } from "./languages";
import type { Title } from "./types";

const FEATURED_IDS = ["parasite", "past-lives", "spider-verse", "fleabag", "frieren", "knives-out"];

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function rankTitles(query: string, titles: readonly Title[]): Title[] {
  const normalized = normalize(query);
  if (!normalized) {
    return FEATURED_IDS.flatMap((id) => {
      const title = titles.find((item) => item.id === id);
      return title ? [title] : [];
    }).slice(0, 6);
  }

  return titles
    .map((title) => ({ title, score: scoreMatch(title, normalized) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.title.audience - a.title.audience || a.title.name.localeCompare(b.title.name))
    .slice(0, 8)
    .map((item) => item.title);
}

function scoreMatch(title: Title, query: string): number {
  const name = normalize(title.name);
  const aliases = title.aliases.map((alias) => normalize(alias));
  const fields = [name, ...aliases];
  let score = 0;
  if (fields.some((field) => field === query)) score = 100;
  else if (fields.some((field) => field.startsWith(query))) score = 86;
  else if (name.split(" ").some((word) => word.startsWith(query))) score = 78;
  else if (aliases.some((alias) => alias.split(" ").some((word) => word.startsWith(query)))) score = 74;
  else if (fields.some((field) => field.includes(query))) score = 64;
  else if (normalize(title.creator).includes(query)) score = 52;
  else if (normalize(title.language).includes(query)) score = 40;
  else if (title.vibeTags.some((tag) => normalize(tag).includes(query))) score = 36;
  else if (normalize(title.kind).startsWith(query)) score = 30;
  else if (String(title.year) === query) score = 44;

  if (query.length === 1 && score < 74) return 0;
  return score;
}

export function matchesLanguage(title: Title, code: string, audio: AudioMatch): boolean {
  if (!code) return true;
  const name = languageName(code).toLowerCase();
  if (audio === "original") return title.language.toLowerCase().includes(name);
  return (title.listedIn ?? "").toLowerCase().includes(name);
}

export function splitMatch(text: string, query: string): { text: string; match: boolean }[] {
  const needle = query.trim();
  if (needle.length < 2) return [{ text, match: false }];
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return [{ text, match: false }];
  return [
    { text: text.slice(0, index), match: false },
    { text: text.slice(index, index + needle.length), match: true },
    { text: text.slice(index + needle.length), match: false },
  ].filter((part) => part.text.length > 0);
}
