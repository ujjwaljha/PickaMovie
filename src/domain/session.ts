import { PRESETS } from "../data/presets";
import { TITLE_BY_ID } from "../data/titles";
import { rankPool, type Voter } from "./scoring";
import type { Company, Energy, Filters, TimeSlot, Title } from "./types";

export const MAX_TITLES = 4;
export const MAX_PEOPLE = 4;
export const STORAGE_KEY = "what2watch.session.v1";
export const PERSON_COLORS = ["#e50914", "#54b9c5", "#46d369", "#e6b325"] as const;

const FRIEND_NAMES = ["Alex", "Sam", "Jules"];
const TIME_SLOTS = new Set<TimeSlot>(["any", "90min", "evening", "episode"]);
const ENERGIES = new Set<Energy>(["any", "focus", "relaxed", "emotional"]);
const COMPANIES = new Set<Company>(["any", "solo", "date", "group"]);

export type Person = {
  id: string;
  name: string;
  color: string;
  filters: Filters;
  picks: string[];
};

export type Session = {
  order: string[];
  people: Person[];
  groupMode: boolean;
  activePersonId: string;
  verdictId: string | null;
};

export type Action =
  | { type: "add"; titleId: string }
  | { type: "remove"; titleId: string }
  | { type: "set-filters"; filters: Filters }
  | { type: "toggle-group" }
  | { type: "add-person" }
  | { type: "remove-person"; personId: string }
  | { type: "rename-person"; personId: string; name: string }
  | { type: "set-active"; personId: string }
  | { type: "load-preset"; presetId: string }
  | { type: "weigh"; titles?: readonly Title[] }
  | { type: "reset" };

const TMDB_ID = /^tmdb-(movie|tv)-\d{1,10}$/;

export function isCatalogId(id: string): boolean {
  return TITLE_BY_ID.has(id) || TMDB_ID.test(id);
}

export const EMPTY_FILTERS: Filters = { time: "any", energy: "any", company: "any" };

export function defaultSession(): Session {
  return {
    order: [],
    people: [youPersonDraft()],
    groupMode: false,
    activePersonId: "you",
    verdictId: null,
  };
}

export function youPerson(session: Session): Person {
  return session.people.find((person) => person.id === "you") ?? session.people[0] ?? youPersonDraft();
}

export function actingPerson(session: Session): Person {
  if (!session.groupMode) return youPerson(session);
  return session.people.find((person) => person.id === session.activePersonId) ?? youPerson(session);
}

export function voters(session: Session): Person[] {
  return session.groupMode ? session.people : [youPerson(session)];
}

export function poolIds(session: Session): string[] {
  return session.order;
}

export function addBlockReason(session: Session, titleId: string): "missing" | "dup" | "full" | null {
  if (!isCatalogId(titleId)) return "missing";
  if (actingPerson(session).picks.includes(titleId)) return "dup";
  if (!session.order.includes(titleId) && session.order.length >= MAX_TITLES) return "full";
  return null;
}

export function reduceSession(session: Session, action: Action): Session {
  switch (action.type) {
    case "add": {
      if (addBlockReason(session, action.titleId)) return session;
      const person = actingPerson(session);
      const order = session.order.includes(action.titleId) ? session.order : [...session.order, action.titleId];
      return sanitizeSession({
        ...session,
        order,
        verdictId: null,
        people: session.people.map((item) =>
          item.id === person.id ? { ...item, picks: [...item.picks, action.titleId] } : item,
        ),
      });
    }
    case "remove":
      return sanitizeSession({
        ...session,
        order: session.order.filter((id) => id !== action.titleId),
        verdictId: null,
        people: session.people.map((person) => ({
          ...person,
          picks: person.picks.filter((id) => id !== action.titleId),
        })),
      });
    case "set-filters": {
      const person = actingPerson(session);
      if (sameFilters(person.filters, action.filters)) return session;
      return sanitizeSession({
        ...session,
        verdictId: null,
        people: session.people.map((item) => (item.id === person.id ? { ...item, filters: action.filters } : item)),
      });
    }
    case "toggle-group": {
      const groupMode = !session.groupMode;
      return sanitizeSession({
        ...session,
        groupMode,
        verdictId: null,
        activePersonId: groupMode ? session.activePersonId : "you",
      });
    }
    case "add-person": {
      if (session.people.length >= MAX_PEOPLE) return session;
      const id = nextFriendId(session.people);
      const person: Person = {
        id,
        name: FRIEND_NAMES[session.people.length - 1] ?? "Friend",
        color: PERSON_COLORS[session.people.length % PERSON_COLORS.length] ?? PERSON_COLORS[0],
        filters: { ...youPerson(session).filters },
        picks: [],
      };
      return sanitizeSession({
        ...session,
        groupMode: true,
        people: [...session.people, person],
        activePersonId: id,
        verdictId: null,
      });
    }
    case "remove-person": {
      if (action.personId === "you") return session;
      const people = session.people.filter((person) => person.id !== action.personId);
      const still = new Set(people.flatMap((person) => person.picks));
      return sanitizeSession({
        ...session,
        people,
        order: session.order.filter((id) => still.has(id)),
        activePersonId: session.activePersonId === action.personId ? "you" : session.activePersonId,
        verdictId: null,
      });
    }
    case "rename-person": {
      const name = cleanName(action.name, "");
      if (!name) return session;
      return sanitizeSession({
        ...session,
        people: session.people.map((person) => (person.id === action.personId ? { ...person, name } : person)),
      });
    }
    case "set-active":
      if (!session.groupMode || !session.people.some((person) => person.id === action.personId)) return session;
      return { ...session, activePersonId: action.personId };
    case "load-preset": {
      const preset = PRESETS.find((item) => item.id === action.presetId);
      if (!preset) return session;
      const ids = preset.titleIds.filter((id) => TITLE_BY_ID.has(id)).slice(0, MAX_TITLES);
      return sanitizeSession({
        ...session,
        order: ids,
        verdictId: null,
        activePersonId: "you",
        people: session.people.map((person) =>
          person.id === "you" ? { ...person, filters: preset.filters, picks: [...ids] } : { ...person, picks: [] },
        ),
      });
    }
    case "weigh": {
      const supplied = new Map((action.titles ?? []).map((title) => [title.id, title]));
      const titles = session.order.flatMap((id) => {
        const title = supplied.get(id) ?? TITLE_BY_ID.get(id);
        return title ? [title] : [];
      });
      if (titles.length < 2) return session;
      const ranked = rankPool(titles, voters(session) satisfies Voter[]);
      return { ...session, verdictId: ranked[0]?.title.id ?? null };
    }
    case "reset":
      return defaultSession();
    default:
      return session;
  }
}

export function sanitizeSession(raw: unknown): Session {
  const base = defaultSession();
  if (!raw || typeof raw !== "object") return base;
  const record = raw as Record<string, unknown>;
  const people: Person[] = [];
  const incoming = Array.isArray(record.people) ? record.people : [];
  for (const item of incoming) {
    const person = sanitizePerson(item, people.length);
    if (!person || people.some((existing) => existing.id === person.id)) continue;
    people.push(person);
    if (people.length >= MAX_PEOPLE) break;
  }
  if (!people.some((person) => person.id === "you")) people.unshift(youPersonDraft());
  const youIndex = people.findIndex((person) => person.id === "you");
  if (youIndex > 0) {
    const [you] = people.splice(youIndex, 1);
    if (you) people.unshift(you);
  }
  const you = people[0];
  if (you) people[0] = { ...you, name: cleanName(you.name, "You"), id: "you" };

  let order = sanitizeIdList(record.order);
  if (order.length === 0) order = sanitizeIdList(people.flatMap((person) => person.picks));
  const allowed = new Set(order);
  const normalized = people.map((person) => ({
    ...person,
    picks: person.picks.filter((id) => allowed.has(id)),
  }));
  const host = normalized[0];
  if (host) {
    for (const id of order) {
      if (!normalized.some((person) => person.picks.includes(id))) host.picks.push(id);
    }
  }

  const activePersonId =
    typeof record.activePersonId === "string" && normalized.some((person) => person.id === record.activePersonId)
      ? record.activePersonId
      : "you";
  const verdictId = typeof record.verdictId === "string" && order.includes(record.verdictId) ? record.verdictId : null;

  return {
    order,
    people: normalized,
    groupMode: record.groupMode === true,
    activePersonId,
    verdictId,
  };
}

export function sessionToHash(session: Session): string {
  const you = youPerson(session);
  const params = new URLSearchParams();
  const ids = session.order.filter((id) => you.picks.includes(id));
  if (ids.length > 0) params.set("w", ids.join("."));
  if (you.filters.time !== "any") params.set("t", you.filters.time);
  if (you.filters.energy !== "any") params.set("e", you.filters.energy);
  if (you.filters.company !== "any") params.set("c", you.filters.company);
  const query = params.toString();
  return query ? `#${query}` : "";
}

export function applyHash(session: Session, hash: string): Session {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const hasSignal = ["w", "t", "e", "c"].some((key) => params.has(key));
  if (!hasSignal) return session;

  const you = youPerson(session);
  const time = params.get("t");
  const energy = params.get("e");
  const company = params.get("c");
  const nextFilters: Filters = {
    time: isTimeSlot(time) ? time : "any",
    energy: isEnergy(energy) ? energy : "any",
    company: isCompany(company) ? company : "any",
  };
  const listed = session.order.filter((id) => you.picks.includes(id));
  const hashIds = params.has("w") ? sanitizeIdList((params.get("w") ?? "").split(".")) : [];
  const sameIds = hashIds.length === listed.length && hashIds.every((id, index) => id === listed[index]);
  if (sameIds && sameFilters(nextFilters, you.filters)) return session;

  const people = session.people.map((person) =>
    person.id === you.id ? { ...person, filters: nextFilters, picks: hashIds } : { ...person, picks: [] },
  );
  return sanitizeSession({
    ...session,
    people,
    order: hashIds,
    verdictId: null,
    activePersonId: "you",
  });
}

export function loadSession(storage: Pick<Storage, "getItem"> | null, hash: string): Session {
  const stored = sanitizeSession(parseStored(storage?.getItem(STORAGE_KEY) ?? null));
  if (!hash || hash === "#") return stored;
  return applyHash(stored, hash);
}

export function saveSession(storage: Pick<Storage, "setItem">, session: Session): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function youPersonDraft(): Person {
  return {
    id: "you",
    name: "You",
    color: PERSON_COLORS[0],
    filters: { ...EMPTY_FILTERS },
    picks: [],
  };
}

function sanitizePerson(raw: unknown, index: number): Person | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" && /^[a-zA-Z0-9-]{1,24}$/.test(record.id) ? record.id : null;
  if (!id) return null;
  return {
    id,
    name: cleanName(record.name, id === "you" ? "You" : "Friend"),
    color: typeof record.color === "string" && /^#[0-9a-fA-F]{6}$/.test(record.color)
      ? record.color
      : (PERSON_COLORS[index % PERSON_COLORS.length] ?? PERSON_COLORS[0]),
    filters: sanitizeFilters(record.filters),
    picks: sanitizeIdList(record.picks),
  };
}

function sanitizeFilters(raw: unknown): Filters {
  if (!raw || typeof raw !== "object") return { ...EMPTY_FILTERS };
  const record = raw as Record<string, unknown>;
  return {
    time: isTimeSlot(record.time) ? record.time : "any",
    energy: isEnergy(record.energy) ? record.energy : "any",
    company: isCompany(record.company) ? record.company : "any",
  };
}

function sanitizeIdList(raw: unknown): string[] {
  const source = Array.isArray(raw) ? raw : [];
  const ids: string[] = [];
  for (const item of source) {
    if (typeof item !== "string" || !isCatalogId(item) || ids.includes(item)) continue;
    ids.push(item);
    if (ids.length >= MAX_TITLES) break;
  }
  return ids;
}

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 24);
  return cleaned || fallback;
}

function parseStored(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function nextFriendId(people: readonly Person[]): string {
  let index = 1;
  while (people.some((person) => person.id === `friend-${index}`)) index += 1;
  return `friend-${index}`;
}

function sameFilters(a: Filters, b: Filters): boolean {
  return a.time === b.time && a.energy === b.energy && a.company === b.company;
}

function isTimeSlot(value: unknown): value is TimeSlot {
  return typeof value === "string" && TIME_SLOTS.has(value as TimeSlot);
}

function isEnergy(value: unknown): value is Energy {
  return typeof value === "string" && ENERGIES.has(value as Energy);
}

function isCompany(value: unknown): value is Company {
  return typeof value === "string" && COMPANIES.has(value as Company);
}
