import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { PRESETS } from "../data/presets";
import { narrateDecision, scoreTitle, type RankedTitle } from "../domain/scoring";
import { youPerson, type Person, type Session } from "../domain/session";
import type { Filters, Title } from "../domain/types";
import { catalog } from "../services/catalog";
import { Comparison } from "./Comparison";
import { Meter } from "./Meter";
import { Poster } from "./Poster";

export function Stage({
  session,
  titles,
  ranked,
  focusToken,
  onPreset,
  onRemove,
  onWeigh,
}: {
  session: Session;
  titles: Title[];
  ranked: RankedTitle[];
  focusToken: number;
  onPreset: (id: string) => void;
  onRemove: (id: string) => void;
  onWeigh: () => void;
}) {
  const verdict = ranked.find((item) => item.title.id === session.verdictId) ?? null;
  const filters = youPerson(session).filters;

  return (
    <section className="stage" id="comparison">
      {titles.length === 0 ? (
        <Hero onPreset={onPreset} />
      ) : (
        <>
          <div className="stage-head">
            <h1>Side by side</h1>
            {titles.length > 1 ? (
              <button type="button" className="btn btn-primary" onClick={onWeigh}>
                Weigh and pick
              </button>
            ) : null}
          </div>
          {verdict ? (
            <Ticket
              focusToken={focusToken}
              ranked={ranked}
              verdict={verdict}
              filters={filters}
              people={session.people}
              groupMode={session.groupMode}
            />
          ) : null}
          <Comparison
            titles={titles}
            ranked={ranked}
            filters={session.groupMode ? actingFilters(session) : filters}
            people={session.people}
            groupMode={session.groupMode}
            moodLabel={moodLabel(session)}
            onRemove={onRemove}
          />
        </>
      )}
    </section>
  );
}

function actingFilters(session: Session): Filters {
  return session.people.find((person) => person.id === session.activePersonId)?.filters ?? youPerson(session).filters;
}

function moodLabel(session: Session): string {
  const person = session.people.find((item) => item.id === session.activePersonId) ?? youPerson(session);
  return person.id === "you" ? "your mood" : `${person.name}'s mood`;
}

function Hero({ onPreset }: { onPreset: (id: string) => void }) {
  return (
    <div className="hero">
      <p className="eyebrow">No account. No continue-watching pile.</p>
      <h1>Put a few titles on the table.</h1>
      <p className="lede">
        Movies, series, anime, and animation, lined up on the only things that matter tonight: how long it takes, how it feels, and who is in the room.
      </p>
      <div className="preset-grid">
        {PRESETS.map((preset) => {
          const titles = catalog.getMany(preset.titleIds);
          return (
            <button key={preset.id} type="button" className="preset" onClick={() => onPreset(preset.id)}>
              <span className="fan" aria-hidden="true">
                {titles.map((title) => (
                  <Poster key={title.id} title={title} size="sm" />
                ))}
              </span>
              <span className="eyebrow">{preset.eyebrow}</span>
              <span className="preset-title">{preset.title}</span>
              <span className="preset-blurb">{preset.blurb}</span>
              <span className="preset-go">
                Compare these <ArrowRight size={16} aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
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
  const parts = scoreTitle(verdict.title, filters);
  const tie = leaders.length > 1;

  useEffect(() => {
    if (!focusToken) return;
    ref.current?.focus();
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusToken]);

  return (
    <article className="ticket" tabIndex={-1} ref={ref} key={focusToken}>
      <p className="eyebrow">{tie ? "Too close to call" : "Tonight's pick"}</p>
      <h2>{tie ? leaders.map((item) => item.title.name).join(" · ") : verdict.title.name}</h2>
      <p className="ticket-score">
        <strong>{verdict.weigh.total}</strong>
        <span>fit</span>
      </p>
      <p className="ticket-copy">{narrateDecision(ranked, { groupMode, filters })}</p>
      {groupMode ? (
        <ul className="ticket-people">
          {verdict.weigh.perPerson.map((person) => {
            const color = people.find((item) => item.id === person.personId)?.color ?? "#f0a202";
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
      ) : (
        <ul className="ticket-factors">
          <Factor label="Clock" value={parts.time} open={filters.time === "any"} />
          <Factor label="Energy" value={parts.energy} open={filters.energy === "any"} />
          <Factor label="Company" value={parts.company} open={filters.company === "any"} />
          <Factor label="Scores" value={parts.sentiment} open={false} />
        </ul>
      )}
      {verdict.weigh.pickCount > 1 ? <p className="ticket-bonus">It got a lift because more than one person already picked it.</p> : null}
    </article>
  );
}

function Factor({ label, value, open }: { label: string; value: number; open: boolean }) {
  return (
    <li>
      <span>{label}</span>
      {open ? <em>Any</em> : <Meter value={value * 100} />}
      <strong>{open ? "Any" : Math.round(value * 100)}</strong>
    </li>
  );
}
