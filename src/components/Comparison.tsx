import { X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { KIND_LABEL, PACING_COPY } from "../domain/copy";
import { intensityLabel, joinNames, sessionPlan, timeNote } from "../domain/format";
import { pacingMatch, timeFit, type RankedTitle } from "../domain/scoring";
import type { Person } from "../domain/session";
import type { Filters, Title } from "../domain/types";
import { Meter } from "./Meter";
import { Poster } from "./Poster";

export function Comparison({
  titles,
  ranked,
  filters,
  people,
  groupMode,
  moodLabel,
  onRemove,
}: {
  titles: Title[];
  ranked: RankedTitle[];
  filters: Filters;
  people: Person[];
  groupMode: boolean;
  moodLabel: string;
  onRemove: (id: string) => void;
}) {
  const top = ranked[0]?.weigh.total ?? 0;
  const leaders = new Set(ranked.filter((item) => item.weigh.total === top).map((item) => item.title.id));
  const weighOf = new Map(ranked.map((item) => [item.title.id, item.weigh]));
  const showLeaders = titles.length > 1;

  const metrics: Metric[] = [
    {
      id: "time",
      label: "Time commitment",
      best: bestSet(titles, (title) => timeFit(title, filters.time)),
      render: (title) => {
        const plan = sessionPlan(title, filters.time);
        const note = timeNote(timeFit(title, filters.time), filters.time);
        return (
          <div className="stack">
            <strong>{plan.primary}</strong>
            <span>{plan.detail}</span>
            {note ? <em className="note">{note}</em> : null}
          </div>
        );
      },
    },
    {
      id: "pacing",
      label: "Pacing and intensity",
      best: bestSet(titles, (title) => pacingMatch(title.pacing, filters.energy)),
      render: (title) => (
        <div className="stack">
          <strong>{PACING_COPY[title.pacing].label}</strong>
          <span>{PACING_COPY[title.pacing].hint}</span>
          <span className="intensity">
            <Dots value={title.intensity} />
            {title.intensity}/10 · {intensityLabel(title.intensity)}
          </span>
        </div>
      ),
    },
    {
      id: "vibes",
      label: "Vibe",
      best: new Set(),
      render: (title) => (
        <ul className="vibes">
          {title.vibeTags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ),
    },
    {
      id: "critic",
      label: "Critics",
      best: bestSet(titles, (title) => title.critic),
      render: (title) => (
        <div className="score-line">
          <strong>{title.critic}</strong>
          <Meter value={title.critic} />
        </div>
      ),
    },
    {
      id: "audience",
      label: "Audience",
      best: bestSet(titles, (title) => title.audience),
      render: (title) => (
        <div className="score-line">
          <strong>{title.audience}</strong>
          <Meter value={title.audience} />
        </div>
      ),
    },
    {
      id: "highlights",
      label: "Highlights",
      best: new Set(),
      render: (title) => (
        <div className="stack">
          {title.highlights.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ),
    },
    {
      id: "fit",
      label: "Fit tonight",
      best: showLeaders && leaders.size < titles.length ? leaders : new Set(),
      render: (title) => {
        const total = weighOf.get(title.id)?.total ?? 0;
        const delta = top - total;
        return (
          <div className="stack">
            <strong className="fit-figure">{total}</strong>
            <Meter value={total} />
            <span>
              {titles.length < 2
                ? "Add a rival to rank it"
                : delta === 0
                  ? "Best fit on the table"
                  : `${delta} ${delta === 1 ? "pt" : "pts"} behind`}
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="comparison">
      {titles.length > 1 ? (
        <p className="leading-banner" role="status">
          {leadingCopy(ranked)}
        </p>
      ) : (
        <p className="leading-banner">Add another title and the table will take a side.</p>
      )}
      {groupMode ? <p className="hint">Clock and pacing highlights follow {moodLabel}. Fit balances the whole couch.</p> : null}

      <div className="matrix-scroll">
        <table className="compare" style={{ "--title-count": titles.length } as CSSProperties}>
          <caption className="sr-only">Side-by-side comparison of the titles on the table</caption>
          <thead>
            <tr>
              <th scope="col" />
              {titles.map((title) => {
                const leading = showLeaders && leaders.has(title.id);
                return (
                  <th key={title.id} scope="col" className={leading ? "is-leader" : ""}>
                    <TitleHead
                      title={title}
                      people={people}
                      groupMode={groupMode}
                      fit={weighOf.get(title.id)?.total ?? 0}
                      leading={leading}
                      onRemove={onRemove}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.id}>
                <th scope="row">{metric.label}</th>
                {titles.map((title) => (
                  <td key={title.id} className={cellClass(showLeaders && leaders.has(title.id), metric.best.has(title.id))}>
                    {metric.best.has(title.id) ? <span className="best-pill">Best</span> : null}
                    {metric.render(title)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-list">
        {titles.map((title) => {
          const leading = showLeaders && leaders.has(title.id);
          return (
            <article key={title.id} className={leading ? "watch-card is-leader" : "watch-card"}>
              <TitleHead
                title={title}
                people={people}
                groupMode={groupMode}
                fit={weighOf.get(title.id)?.total ?? 0}
                leading={leading}
                onRemove={onRemove}
              />
              <dl>
                {metrics.map((metric) => (
                  <div key={metric.id}>
                    <dt>
                      {metric.label}
                      {metric.best.has(title.id) ? <span className="best-pill">Best</span> : null}
                    </dt>
                    <dd>{metric.render(title)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
      <p className="shelf-note">Editorial scores, written for this shelf. Not a live critic or audience feed.</p>
    </div>
  );
}

function TitleHead({
  title,
  people,
  groupMode,
  fit,
  leading,
  onRemove,
}: {
  title: Title;
  people: Person[];
  groupMode: boolean;
  fit: number;
  leading: boolean;
  onRemove: (id: string) => void;
}) {
  const pickers = people.filter((person) => person.picks.includes(title.id));
  return (
    <div className="col-head">
      <Poster title={title} size="md" />
      <div className="col-copy">
        <p className="kicker">
          {title.year || "Undated"} · {KIND_LABEL[title.kind]}
        </p>
        <h3>{title.name}</h3>
        <p>{title.creator.replaceAll("-", "\u2011")}</p>
        <p>{title.language}</p>
        {groupMode && pickers.length > 0 ? <p className="picked-by">Picked by {joinNames(pickers.map((person) => person.name))}</p> : null}
        <p className="fit-num">
          <strong>{fit}</strong>
          <span>fit</span>
        </p>
        {leading ? <span className="leader-pill">Best fit</span> : null}
        <details>
          <summary>Synopsis</summary>
          <p>{title.synopsis}</p>
        </details>
      </div>
      <button type="button" className="icon-btn" aria-label={`Remove ${title.name}`} onClick={() => onRemove(title.id)}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function Dots({ value }: { value: number }) {
  const filled = Math.round(value / 2);
  return (
    <span className="dots" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <i key={index} className={index < filled ? "on" : ""} />
      ))}
    </span>
  );
}

function leadingCopy(ranked: RankedTitle[]): string {
  const top = ranked[0];
  if (!top) return "";
  const tied = ranked.filter((item) => item.weigh.total === top.weigh.total);
  if (tied.length > 1) return `Tied: ${joinNames(tied.map((item) => item.title.name))} · ${top.weigh.total}`;
  return `Leading: ${top.title.name} · ${top.weigh.total}`;
}

function bestSet(titles: readonly Title[], score: (title: Title) => number): Set<string> {
  if (titles.length < 2) return new Set();
  let best = -Infinity;
  const ids: string[] = [];
  for (const title of titles) {
    const value = score(title);
    if (value > best + 1e-9) {
      best = value;
      ids.length = 0;
      ids.push(title.id);
    } else if (Math.abs(value - best) <= 1e-9) ids.push(title.id);
  }
  if (ids.length === titles.length) return new Set();
  return new Set(ids);
}

function cellClass(leader: boolean, best: boolean): string {
  return [leader ? "is-leader" : "", best ? "is-best" : ""].filter(Boolean).join(" ");
}

type Metric = {
  id: string;
  label: string;
  best: Set<string>;
  render: (title: Title) => ReactNode;
};
