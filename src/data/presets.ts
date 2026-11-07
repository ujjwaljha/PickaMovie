import type { Filters } from "../domain/types";

export type Preset = {
  id: string;
  eyebrow: string;
  title: string;
  blurb: string;
  filters: Filters;
  titleIds: string[];
};

export const PRESETS: readonly Preset[] = [
  {
    id: "home-by-eleven",
    eyebrow: "90 minutes · Date night",
    title: "Home by eleven",
    blurb: "Three quiet ways to sit close and still make it an early night.",
    filters: { time: "90min", energy: "emotional", company: "date" },
    titleIds: ["before-sunrise", "past-lives", "in-the-mood-for-love"],
  },
  {
    id: "one-couch",
    eyebrow: "Full evening · Friends",
    title: "One couch, three opinions",
    blurb: "Crowd-pleasers with a point of view, for a relaxed room.",
    filters: { time: "evening", energy: "relaxed", company: "group" },
    titleIds: ["knives-out", "paddington-2", "spider-verse"],
  },
  {
    id: "phone-down",
    eyebrow: "Full evening · High focus",
    title: "Phone in the other room",
    blurb: "Dense, precise films. Lights down, no second screen.",
    filters: { time: "evening", energy: "focus", company: "solo" },
    titleIds: ["parasite", "arrival", "dune-part-two"],
  },
  {
    id: "lights-out",
    eyebrow: "One episode · Relaxed",
    title: "Then lights out",
    blurb: "A complete bite. No season premiere trap.",
    filters: { time: "episode", energy: "relaxed", company: "solo" },
    titleIds: ["mushishi", "aggretsuko", "reservation-dogs"],
  },
];
