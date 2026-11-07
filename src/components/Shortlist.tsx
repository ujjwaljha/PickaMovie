import { X } from "lucide-react";
import { joinNames } from "../domain/format";
import { MAX_TITLES, type Person } from "../domain/session";
import type { Title } from "../domain/types";
import { Poster } from "./Poster";

export function Shortlist({
  titles,
  people,
  groupMode,
  onRemove,
}: {
  titles: Title[];
  people: Person[];
  groupMode: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="shortlist" aria-label="Titles on the table">
      <div className="section-row">
        <h2>On the table</h2>
        <span>
          {titles.length}/{MAX_TITLES}
        </span>
      </div>
      {titles.length === 0 ? (
        <p className="hint">Search a title, or start from a toss-up.</p>
      ) : (
        <ul>
          {titles.map((title) => {
            const pickers = people.filter((person) => person.picks.includes(title.id));
            return (
              <li key={title.id}>
                <Poster title={title} size="sm" />
                <span>
                  <strong>{title.name}</strong>
                  {groupMode && pickers.length > 0 ? <small>Picked by {joinNames(pickers.map((person) => person.name))}</small> : null}
                </span>
                <button type="button" className="icon-btn" aria-label={`Remove ${title.name}`} onClick={() => onRemove(title.id)}>
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
