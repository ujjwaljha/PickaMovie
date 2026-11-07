import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { KIND_LABEL } from "../domain/copy";
import { formatDuration } from "../domain/format";
import { splitMatch } from "../domain/search";
import { actingPerson, addBlockReason, type Session } from "../domain/session";
import { catalog } from "../services/catalog";
import { Poster } from "./Poster";

export function SearchBox({ session, onAdd }: { session: Session; onAdd: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const results = useMemo(() => catalog.search(query), [query]);
  const person = actingPerson(session);
  const safeActive = results.length === 0 ? 0 : Math.min(active, results.length - 1);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const commit = (id: string) => {
    const reason = addBlockReason(session, id);
    if (reason === "dup" || reason === "missing") return;
    onAdd(id);
  };

  return (
    <div className="search" ref={rootRef}>
      <label htmlFor="title-search">
        {session.groupMode ? `Add a title for ${person.name}` : "Search the shelf"}
      </label>
      <div className="search-field">
        <Search size={18} aria-hidden="true" />
        <input
          id="title-search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[safeActive] ? `${listId}-${safeActive}` : undefined}
          placeholder="Title, mood, or director"
          value={query}
          maxLength={80}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((current) => (open ? Math.min(results.length - 1, current + 1) : 0));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((current) => Math.max(0, current - 1));
              return;
            }
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const chosen = results[safeActive];
              if (chosen) commit(chosen.id);
            }
          }}
        />
        <kbd className="slash">/</kbd>
      </div>
      {open ? (
        <div className="results">
          <p className="results-label">{query.trim() ? "Matches" : "From the shelf"}</p>
          {results.length === 0 ? (
            <p className="results-empty">Nothing on the shelf matches that. Try a director, a year, or a mood.</p>
          ) : (
            <ul id={listId} role="listbox">
              {results.map((title, index) => {
                const reason = addBlockReason(session, title.id);
                const disabled = reason === "dup" || reason === "full";
                const label = reason === "dup" ? "Added" : reason === "full" ? "Full" : session.groupMode && session.order.includes(title.id) ? `Add to ${person.name}` : "Add";
                return (
                  <li
                    key={title.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === safeActive}
                    aria-disabled={disabled}
                    className={index === safeActive ? "is-active" : ""}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (!disabled) commit(title.id);
                    }}
                  >
                    <Poster title={title} size="sm" />
                    <span className="result-copy">
                      <span className="result-name">
                        {splitMatch(title.name, query).map((part, partIndex) =>
                          part.match ? <mark key={partIndex}>{part.text}</mark> : <span key={partIndex}>{part.text}</span>,
                        )}
                      </span>
                      <span className="result-meta">
                        {KIND_LABEL[title.kind]} · {title.year || "Undated"} ·{" "}
                        {title.episodeMinutes
                          ? `${title.episodeMinutes} min episodes`
                          : formatDuration(title.runtimeMinutes, title.approximate)}
                      </span>
                    </span>
                    <span className={disabled ? "result-action is-quiet" : "result-action"}>{label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
