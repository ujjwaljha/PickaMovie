import { describeFilters, PACING_COPY } from "./copy";
import { joinNames, sessionPlan } from "./format";
import type { Energy, Filters, Pacing, Title } from "./types";

const WEIGHTS = {
  time: 34,
  energy: 26,
  company: 22,
  sentiment: 18,
} as const;

const PACING_ORDER: Record<Energy, readonly Pacing[]> = {
  any: ["easy", "engaged", "background", "demanding"],
  focus: ["demanding", "engaged", "easy", "background"],
  relaxed: ["background", "easy", "engaged", "demanding"],
  emotional: ["engaged", "demanding", "easy", "background"],
};

export type ScoreParts = {
  time: number;
  energy: number;
  company: number;
  sentiment: number;
  total: number;
};

export type PersonScore = {
  personId: string;
  name: string;
  score: number;
  picked: boolean;
};

export type WeighResult = {
  total: number;
  average: number;
  bonus: number;
  perPerson: PersonScore[];
  pickCount: number;
};

export type Voter = {
  id: string;
  name: string;
  filters: Filters;
  picks: readonly string[];
};

export type RankedTitle = {
  title: Title;
  weigh: WeighResult;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function closeness(value: number, ideal: number, radius: number, falloff: number): number {
  const distance = Math.abs(value - ideal);
  if (distance <= radius) return 1;
  const t = (distance - radius) / falloff;
  return Math.max(0.22, 1 - t * 0.78);
}

export function sentiment(title: Title): number {
  return (title.audience * 0.55 + title.critic * 0.45) / 100;
}

/** How well a title's length matches the clock, from 0 to 1. */
export function timeFit(title: Title, slot: Filters["time"]): number {
  if (slot === "any") return 0.74;
  if (!title.runtimeMinutes && !title.episodeMinutes) return 0.45;

  const episodic = Boolean(title.episodeMinutes && title.episodeCount);

  if (slot === "episode") {
    if (!episodic || !title.episodeMinutes) return 0.18;
    const episode = title.episodeMinutes;
    if (episode <= 20) return 0.9;
    if (episode <= 32) return 1;
    if (episode <= 45) return 0.82;
    if (episode <= 62) return 0.58;
    return 0.4;
  }

  if (slot === "90min") {
    if (episodic && title.episodeMinutes) {
      const episodes = Math.max(1, Math.floor(100 / title.episodeMinutes));
      const chunk = Math.min(episodes * title.episodeMinutes, title.runtimeMinutes);
      if (chunk >= 45 && chunk <= 100) return 0.9;
      if (chunk < 45) return 0.72;
      return 0.5;
    }
    return closeness(title.runtimeMinutes, 88, 18, 40);
  }

  if (episodic) {
    const total = title.runtimeMinutes;
    if (total >= 120 && total <= 210) return 1;
    if (total >= 90 && total < 120) return 0.78;
    if (total > 210 && total <= 280) return 0.8;
    if (total > 280 && total <= 360) return 0.62;
    if (total < 90) return 0.45;
    return 0.38;
  }

  return closeness(title.runtimeMinutes, 145, 35, 55);
}

export function pacingMatch(pacing: Pacing, energy: Energy): number {
  const order = PACING_ORDER[energy];
  const index = order.indexOf(pacing);
  return [1, 0.75, 0.5, 0.28][index] ?? 0.5;
}

export function scoreTitle(title: Title, filters: Filters): ScoreParts {
  const time = timeFit(title, filters.time);
  const energy = filters.energy === "any" ? 0.75 : title.fits[filters.energy] / 100;
  const company = filters.company === "any" ? 0.75 : title.fits[filters.company] / 100;
  const sentimentScore = sentiment(title);
  const total = clamp(
    time * WEIGHTS.time + energy * WEIGHTS.energy + company * WEIGHTS.company + sentimentScore * WEIGHTS.sentiment,
  );
  return { time, energy, company, sentiment: sentimentScore, total };
}

export function weighTitle(title: Title, people: readonly Voter[]): WeighResult {
  const perPerson = people.map((person) => ({
    personId: person.id,
    name: person.name,
    score: scoreTitle(title, person.filters).total,
    picked: person.picks.includes(title.id),
  }));
  const average = perPerson.reduce((sum, person) => sum + person.score, 0) / Math.max(1, perPerson.length);
  const pickCount = perPerson.filter((person) => person.picked).length;
  const bonus = people.length > 1 ? (pickCount / people.length) * 8 : 0;
  return {
    total: clamp(average + bonus),
    average,
    bonus,
    perPerson,
    pickCount,
  };
}

export function rankPool(titles: readonly Title[], people: readonly Voter[]): RankedTitle[] {
  return titles
    .map((title) => ({ title, weigh: weighTitle(title, people) }))
    .sort((a, b) => {
      if (b.weigh.total !== a.weigh.total) return b.weigh.total - a.weigh.total;
      if (b.title.audience !== a.title.audience) return b.title.audience - a.title.audience;
      return a.title.name.localeCompare(b.title.name);
    });
}

export function narrateDecision(
  ranked: readonly RankedTitle[],
  options: { groupMode: boolean; filters: Filters },
): string {
  const top = ranked[0];
  if (!top) return "";
  const tied = ranked.filter((item) => item.weigh.total === top.weigh.total);
  if (tied.length > 1) {
    return `${joinNames(tied.map((item) => item.title.name))} land on the same fit. Tighten the clock or the mood to split them.`;
  }

  const second = ranked[1];
  const gap = second ? top.weigh.total - second.weigh.total : 100;
  const tail = second ? ` ${gap <= 6 ? "Close second" : "Runner-up"}: ${second.title.name}.` : "";
  if (options.groupMode) return `${groupSentence(top)}${tail}`;
  return `${soloSentence(top.title, options.filters)}${tail}`;
}

function soloSentence(title: Title, filters: Filters): string {
  const plan = sessionPlan(title, filters.time);
  const constraints = describeFilters(filters);
  const lead = constraints
    ? `${title.name} fits ${constraints} better than the rest of the table.`
    : `${title.name} leads the table on craft and audience warmth.`;
  const size = `${plan.primary}. ${plan.detail}.`;
  return `${lead} ${size}`;
}

function groupSentence(top: RankedTitle): string {
  const pickers = top.weigh.perPerson.filter((person) => person.picked);
  const total = top.weigh.perPerson.length;
  let who: string;
  if (pickers.length === total) who = "Everyone already had it on their list.";
  else if (pickers.length === 0) who = "It splits the difference across the moods in the room.";
  else if (pickers.length === 1) who = `${pickers[0]?.name ?? "Someone"} brought it, and it still meets the rest of the room.`;
  else who = `${joinNames(pickers.map((person) => person.name))} picked it.`;
  return `${top.title.name} is the compromise. ${who}`;
}

export function pacingCopy(pacing: Pacing): { label: string; hint: string } {
  return PACING_COPY[pacing];
}
