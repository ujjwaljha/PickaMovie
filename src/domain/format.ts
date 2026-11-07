import type { TimeSlot, Title } from "./types";

export function formatDuration(mins: number, approximate = false): string {
  const rounded = Math.max(0, Math.round(mins));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  let core: string;
  if (hours <= 0) core = `${minutes} min`;
  else if (minutes === 0) core = hours === 1 ? "1 hour" : `${hours} hours`;
  else core = `${hours}h ${minutes}m`;
  return approximate ? `about ${core}` : core;
}

export function sessionPlan(title: Title, slot: TimeSlot): { primary: string; detail: string } {
  if (!title.runtimeMinutes && !title.episodeMinutes) {
    return { primary: "Runtime unavailable", detail: "Not in this feed yet" };
  }

  if (!title.episodeMinutes || !title.episodeCount) {
    return {
      primary: formatDuration(title.runtimeMinutes, title.approximate),
      detail: "One sitting",
    };
  }

  const episode = title.episodeMinutes;
  const count = title.episodeCount;
  const season = `${count} × ${episode} min · ${formatDuration(title.runtimeMinutes, title.approximate)} total`;

  if (slot === "episode") {
    return { primary: formatDuration(episode), detail: `1 episode · ${season}` };
  }

  if (slot === "90min") {
    const episodes = Math.max(1, Math.min(count, Math.floor(100 / episode)));
    return {
      primary: formatDuration(episodes * episode),
      detail: `${episodes} episode${episodes === 1 ? "" : "s"} tonight · ${season}`,
    };
  }

  if (slot === "evening") {
    const episodes = Math.max(1, Math.min(count, Math.floor(180 / episode)));
    if (episodes >= count) {
      return {
        primary: formatDuration(title.runtimeMinutes, title.approximate),
        detail: `Finish the season · ${season}`,
      };
    }
    return {
      primary: formatDuration(episodes * episode),
      detail: `${episodes} of ${count} episodes fit in about 3 hours`,
    };
  }

  return {
    primary: formatDuration(title.runtimeMinutes, title.approximate),
    detail: season,
  };
}

export function intensityLabel(intensity: number): string {
  if (intensity <= 3) return "Gentle";
  if (intensity <= 5) return "Steady";
  if (intensity <= 7) return "Heated";
  if (intensity <= 8) return "High";
  return "Relentless";
}

export function timeNote(fit: number, slot: TimeSlot): string | null {
  if (slot === "any") return null;
  if (fit >= 0.95) return "Right size";
  if (fit >= 0.75) return "Close enough";
  if (fit >= 0.5) return "A stretch";
  return "Wrong size tonight";
}

export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
