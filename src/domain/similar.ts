import { KIND_LABEL } from "./copy";
import { joinNames } from "./format";
import type { Fits, Pacing, Title } from "./types";

export type SimilarHit = {
  title: Title;
  score: number;
  reasons: string[];
};

const PACING_INDEX: Record<Pacing, number> = {
  background: 0,
  easy: 1,
  engaged: 2,
  demanding: 3,
};

const FIT_KEYS = ["focus", "relaxed", "emotional", "solo", "date", "group"] as const satisfies readonly (keyof Fits)[];

/** Closest shelf neighbors for the titles someone already named. */
export function similarTo(seeds: readonly Title[], pool: readonly Title[], limit = 6): SimilarHit[] {
  if (seeds.length === 0 || limit <= 0) return [];
  const seedIds = new Set(seeds.map((seed) => seed.id));

  return pool
    .filter((title) => !seedIds.has(title.id))
    .map((title) => scoreCandidate(title, seeds))
    .sort((a, b) => b.score - a.score || b.title.audience - a.title.audience || a.title.name.localeCompare(b.title.name))
    .slice(0, limit);
}

function scoreCandidate(title: Title, seeds: readonly Title[]): SimilarHit {
  const pairs = seeds.map((seed) => scorePair(seed, title));
  const average = pairs.reduce((sum, pair) => sum + pair.score, 0) / pairs.length;
  const close = pairs.filter((pair) => pair.score >= 36).length;
  const bonus = close > 1 ? (close - 1) * 8 : 0;
  const strongest = [...pairs].sort((a, b) => b.score - a.score)[0];
  const reasons = unique([
    ...(strongest?.reasons ?? []),
    close > 1 ? `Close to ${close} of your picks` : "",
  ]).slice(0, 3);

  return {
    title,
    score: Math.max(1, Math.min(100, Math.round(average + bonus))),
    reasons: reasons.length > 0 ? reasons : ["Nearest mood on this shelf"],
  };
}

function scorePair(seed: Title, candidate: Title): { score: number; reasons: string[] } {
  const shared = sharedVibes(seed, candidate);
  const reasons: string[] = [];
  let score = shared.length * 16;
  if (shared.length > 0) reasons.push(`Shares ${joinNames(shared.slice(0, 3))}`);

  if (seed.kind === candidate.kind) {
    score += 12;
    reasons.push(`Also a ${KIND_LABEL[seed.kind].toLowerCase()}`);
  }

  const paceGap = Math.abs(PACING_INDEX[seed.pacing] - PACING_INDEX[candidate.pacing]);
  score += [14, 8, 3, 0][paceGap] ?? 0;
  if (paceGap === 0) reasons.push("Same pace");

  const intensityGap = Math.abs(seed.intensity - candidate.intensity);
  score += Math.max(0, 10 - intensityGap * 2);

  const moodGap = fitDistance(seed.fits, candidate.fits);
  score += Math.max(0, 20 - moodGap / 5);

  if (seed.creator === candidate.creator) {
    score += 22;
    reasons.push(`Also ${seed.creator}`);
  }

  if (languagesTouch(seed.language, candidate.language)) score += 4;

  return { score, reasons };
}

function sharedVibes(seed: Title, candidate: Title): string[] {
  const wanted = new Set(seed.vibeTags.map((tag) => tag.toLowerCase()));
  return candidate.vibeTags.filter((tag) => wanted.has(tag.toLowerCase()));
}

function fitDistance(a: Fits, b: Fits): number {
  const total = FIT_KEYS.reduce((sum, key) => sum + Math.abs(a[key] - b[key]), 0);
  return total / FIT_KEYS.length;
}

function languagesTouch(a: string, b: string): boolean {
  const words = (value: string) =>
    value
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 2);
  const right = new Set(words(b));
  return words(a).some((word) => right.has(word));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
