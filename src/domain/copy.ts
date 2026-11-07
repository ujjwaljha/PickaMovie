import type { Company, Energy, Filters, Kind, Pacing, TimeSlot } from "./types";

export const TIME_OPTIONS: readonly { id: TimeSlot; label: string; hint: string }[] = [
  { id: "any", label: "Any time", hint: "No clock" },
  { id: "90min", label: "90 minutes", hint: "A real window" },
  { id: "evening", label: "Full evening", hint: "Settle in" },
  { id: "episode", label: "One episode", hint: "Then bed" },
];

export const ENERGY_OPTIONS: readonly { id: Energy; label: string; hint: string }[] = [
  { id: "any", label: "Any energy", hint: "No mood yet" },
  { id: "focus", label: "High focus", hint: "Phone down" },
  { id: "relaxed", label: "Relaxed", hint: "Brain-off" },
  { id: "emotional", label: "Emotional", hint: "Feel it" },
];

export const COMPANY_OPTIONS: readonly { id: Company; label: string; hint: string }[] = [
  { id: "any", label: "Any company", hint: "Whoever is here" },
  { id: "solo", label: "Solo", hint: "Just me" },
  { id: "date", label: "Date night", hint: "The two of us" },
  { id: "group", label: "Friends", hint: "Whole couch" },
];

export const KIND_LABEL: Record<Kind, string> = {
  movie: "Movie",
  series: "Series",
  anime: "Anime",
  animation: "Animation",
};

export const PACING_COPY: Record<Pacing, { label: string; hint: string }> = {
  background: { label: "Background watch", hint: "Fine if the room talks over it" },
  easy: { label: "Easy follow", hint: "Light attention still lands" },
  engaged: { label: "Stay with it", hint: "You will want your eyes up" },
  demanding: { label: "Full attention", hint: "Miss a scene and you will feel it" },
};

export function describeFilters(filters: Filters): string {
  const bits: string[] = [];
  if (filters.time === "90min") bits.push("a 90-minute window");
  if (filters.time === "evening") bits.push("a full evening");
  if (filters.time === "episode") bits.push("one episode");
  if (filters.energy === "focus") bits.push("high focus");
  if (filters.energy === "relaxed") bits.push("a brain-off mood");
  if (filters.energy === "emotional") bits.push("an emotional stretch");
  if (filters.company === "solo") bits.push("watching alone");
  if (filters.company === "date") bits.push("date night");
  if (filters.company === "group") bits.push("a friend group");
  if (bits.length === 0) return "";
  if (bits.length === 1) return bits[0] ?? "";
  if (bits.length === 2) return `${bits[0]} and ${bits[1]}`;
  return `${bits.slice(0, -1).join(", ")}, and ${bits[bits.length - 1]}`;
}

export function filterSummary(filters: Filters): string {
  const bits = [
    filters.time === "90min" ? "90m" : filters.time === "evening" ? "Evening" : filters.time === "episode" ? "1 ep" : null,
    filters.energy === "focus" ? "Focus" : filters.energy === "relaxed" ? "Relaxed" : filters.energy === "emotional" ? "Emotional" : null,
    filters.company === "solo" ? "Solo" : filters.company === "date" ? "Date" : filters.company === "group" ? "Friends" : null,
  ].filter((bit): bit is string => Boolean(bit));
  return bits.length > 0 ? bits.join(" · ") : "No preferences";
}
