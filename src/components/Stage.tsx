import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { KIND_LABEL } from "../domain/copy";
import { sessionPlan } from "../domain/format";
import { narrateDecision, type RankedTitle } from "../domain/scoring";
import { youPerson, type Person, type Session } from "../domain/session";
import type { Filters, Title } from "../domain/types";
import type { SimilarHit } from "../domain/similar";
import { CatalogRail } from "./CatalogRail";
import { Comparison } from "./Comparison";
import { Meter } from "./Meter";
import { Poster } from "./Poster";
import { SimilarList } from "./SimilarList";

export function Stage({
  session,
  titles,
  ranked,
  focusToken,
  compareOpen,
  onToggleDetails,
  mode,
  suggestions,
  liveMatches,
  discover,
  extras,
  onRemove,
  onAdd,
}: {
  session: Session;
  titles: Title[];
  ranked: RankedTitle[];
  focusToken: number;
  compareOpen: boolean;
  onToggleDetails: () => void;
  mode: "compare" | "similar";
  suggestions: SimilarHit[];
  liveMatches: boolean;
  discover: Title[];
  extras?: ReactNode;
  onRemove: (id: string) => void;
  onAdd: (title: Title) => void;
}) {
  const verdict = ranked.find((item) => item.title.id === session.verdictId) ?? null;
  const filters = youPerson(session).filters;
  const pickedIds = titles.map((title) => title.id);

  return (
    <section className="stage" id="comparison">
      {mode === "similar" ? (
        <SimilarList seeds={titles} hits={suggestions} live={liveMatches} pickedIds={pickedIds} onAdd={onAdd} onRemove={onRemove} />
      ) : titles.length > 0 ? (
        <>
          {verdict ? (
            <Ticket focusToken={focusToken} ranked={ranked} verdict={verdict} filters={filters} people={session.people} groupMode={session.groupMode} />
          ) : null}
          <QuickLook
            titles={titles}
            ranked={ranked}
            filters={session.groupMode ? actingFilters(session) : filters}
            showRank={verdict != null && titles.length > 1}
            onRemove={onRemove}
          />
          {titles.length > 1 ? (
            <div className="detail-toggle">
              <button type="button" className="btn btn-ghost" aria-expanded={compareOpen} onClick={onToggleDetails}>
                {compareOpen ? "Hide full details" : "Show full details"}
              </button>
            </div>
          ) : null}
          {compareOpen && titles.length > 1 ? (
            <div className="compare-block" id="comparison-table">
              <Comparison
                titles={titles}
                ranked={ranked}
                filters={session.groupMode ? actingFilters(session) : filters}
                people={session.people}
                groupMode={session.groupMode}
                moodLabel={moodLabel(session)}
                onRemove={onRemove}
              />
            </div>
          ) : null}
        </>
      ) : null}
      {extras}
      {mode === "compare" && titles.length < 4 ? (
        <CatalogRail titles={discover} pickedIds={pickedIds} heading={titles.length > 0 ? "Add another" : "Or tap a poster"} onAdd={onAdd} onRemove={onRemove} />
      ) : null}
    </section>
  );
}

function QuickLook({
  titles,
  ranked,
  filters,
  showRank,
  onRemove,
}: {
  titles: Title[];
  ranked: RankedTitle[];
  filters: Filters;
  showRank: boolean;
  onRemove: (id: string) => void;
}) {
  const top = ranked[0]?.weigh.total ?? 0;
  const leaderCount = ranked.filter((item) => item.weigh.total === top).length;
  const showBest = titles.length > 1 && leaderCount < titles.length;
  const fitOf = new Map(ranked.map((item) => [item.title.id, item.weigh.total]));

  return (
    <ul className="quick-look">
      {titles.map((title) => {
        const plan = sessionPlan(title, filters.time);
        const fit = fitOf.get(title.id) ?? 0;
        const best = showBest && fit === top;
        return (
          <li key={title.id} className={best ? "is-best" : undefined}>
            <Poster title={title} size="md" />
            <div className="quick-card">
              <h3>{title.name}</h3>
              <p>{[title.year || "Undated", KIND_LABEL[title.kind], plan.primary].filter(Boolean).join(" · ")}</p>
              <p>{title.audience ? `${title.audience} audience score` : "No audience score yet"}</p>
              {showRank ? (
                <p className={best ? "best-flag" : undefined}>{best ? "Best match" : leaderCount === titles.length ? "Too close to call" : `${top - fit} points behind`}</p>
              ) : null}
            </div>
            <button type="button" className="icon-btn" aria-label={`Remove ${title.name}`} onClick={() => onRemove(title.id)}>
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function actingFilters(session: Session): Filters {
  return session.people.find((person) => person.id === session.activePersonId)?.filters ?? youPerson(session).filters;
}

function moodLabel(session: Session): string {
  const person = session.people.find((item) => item.id === session.activePersonId) ?? youPerson(session);
  return person.id === "you" ? "your mood" : `${person.name}'s mood`;
}

function Ticket({
  focusToken,
  ranked,
  verdict,
  filters,
  people,
  groupMode,
}: {
  focusToken: number;
  ranked: RankedTitle[];
  verdict: RankedTitle;
  filters: Filters;
  people: Person[];
  groupMode: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const leaders = ranked.filter((item) => item.weigh.total === ranked[0]?.weigh.total);
  const tie = leaders.length > 1;

  useEffect(() => {
    if (!focusToken) return;
    ref.current?.focus();
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusToken]);

  return (
    <article className="ticket" tabIndex={-1} ref={ref} key={focusToken}>
      <p className="eyebrow">{tie ? "Too close to call" : "Watch this"}</p>
      <h2>{tie ? leaders.map((item) => item.title.name).join(" · ") : verdict.title.name}</h2>
      <p className="ticket-copy">{narrateDecision(ranked, { groupMode, filters })}</p>
      {groupMode ? (
        <ul className="ticket-people">
          {verdict.weigh.perPerson.map((person) => {
            const color = people.find((item) => item.id === person.personId)?.color ?? "#e50914";
            return (
              <li key={person.personId}>
                <span>
                  <i style={{ backgroundColor: color }} aria-hidden="true" />
                  {person.name}
                  {person.picked ? " picked it" : ""}
                </span>
                <Meter value={person.score} />
                <strong>{person.score}</strong>
              </li>
            );
          })}
        </ul>
      ) : null}
      {verdict.weigh.pickCount > 1 ? <p className="ticket-bonus">It got a lift because more than one person already picked it.</p> : null}
    </article>
  );
}
