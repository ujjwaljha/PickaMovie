import { UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { filterSummary } from "../domain/copy";
import { actingPerson, MAX_PEOPLE, type Session } from "../domain/session";

export function GroupPanel({
  session,
  onEnable,
  onDisable,
  onAddPerson,
  onRemovePerson,
  onRename,
  onActivate,
}: {
  session: Session;
  onEnable: () => void;
  onDisable: () => void;
  onAddPerson: () => void;
  onRemovePerson: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onActivate: (id: string) => void;
}) {
  const active = actingPerson(session);
  return (
    <section className="panel" aria-label="Group watch">
      <button
        type="button"
        className="btn btn-ghost toggle-wide"
        aria-pressed={session.groupMode}
        onClick={() => (session.groupMode ? onDisable() : onEnable())}
      >
        <UserPlus size={16} aria-hidden="true" />
        Add a friend's pick
      </button>
      {session.groupMode ? (
        <div className="group-body">
          <p className="hint">Same screen, same couch. Each person keeps their own mood, then Weigh and pick finds the overlap.</p>
          <ul className="person-list">
            {session.people.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className="person-chip"
                  aria-pressed={person.id === active.id}
                  onClick={() => onActivate(person.id)}
                >
                  <i style={{ backgroundColor: person.color }} aria-hidden="true" />
                  <span>{person.name}</span>
                  <small>{filterSummary(person.filters)}</small>
                </button>
                {person.id !== "you" ? (
                  <button type="button" className="icon-btn" aria-label={`Remove ${person.name}`} onClick={() => onRemovePerson(person.id)}>
                    <X size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <NameField name={active.name} onCommit={(name) => onRename(active.id, name)} />
          <button type="button" className="btn btn-ghost" onClick={onAddPerson} disabled={session.people.length >= MAX_PEOPLE}>
            <UserPlus size={16} aria-hidden="true" />
            Add another
          </button>
        </div>
      ) : null}
    </section>
  );
}

function NameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  return (
    <label className="name-field">
      Name on the couch
      <input
        value={draft}
        maxLength={24}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (!next) {
            setDraft(name);
            return;
          }
          onCommit(next);
        }}
      />
    </label>
  );
}
