import { Minus, Plus, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { KIND_LABEL } from "../domain/copy";
import { formatDuration } from "../domain/format";
import { CATALOG_LANGUAGES, languageName, type AudioMatch } from "../domain/languages";
import { matchesLanguage, splitMatch } from "../domain/search";
import { actingPerson, addBlockReason, type Session } from "../domain/session";
import type { Title } from "../domain/types";
import { catalog } from "../services/catalog";
import { searchLive } from "../services/liveCatalog";
import { Poster } from "./Poster";

export function SearchBox({
  session,
  onAdd,
  onRemove,
  label,
  catalogLive,
  discover,
  language,
  audio,
  onLanguage,
  onAudio,
}: {
  session: Session;
  onAdd: (title: Title) => void;
  onRemove: (id: string) => void;
  label?: string;
  catalogLive: boolean;
  discover: Title[];
  language: string;
  audio: AudioMatch;
  onLanguage: (language: string) => void;
  onAudio: (audio: AudioMatch) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [remote, setRemote] = useState<Title[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const shelf = useMemo(() => {
    if (language && query.trim().length < 2) return catalog.all().filter((title) => matchesLanguage(title, language, audio)).slice(0, 12);
    return catalog.search(query).filter((title) => matchesLanguage(title, language, audio));
  }, [audio, language, query]);
  const usingRemote = catalogLive && query.trim().length >= 2 && remote !== null;
  const browsing = catalogLive && query.trim().length < 2 && audio !== "listed" && discover.length > 0;
  const results = usingRemote ? remote : browsing ? discover.slice(0, 12) : shelf;
  const person = actingPerson(session);
  const safeActive = results.length === 0 ? 0 : Math.min(active, results.length - 1);

  useEffect(() => {
    if (!catalogLive) {
      setRemote(null);
      setSearching(false);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setRemote(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setRemote(null);
    const timer = window.setTimeout(() => {
      void searchLive(q, { language, audio }, controller.signal).then((found) => {
        if (controller.signal.aborted) return;
        setSearching(false);
        setRemote(found);
      });
    }, 500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [audio, catalogLive, language, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const commit = (title: Title) => {
    if (session.order.includes(title.id)) {
      onRemove(title.id);
      return;
    }
    onAdd(title);
  };

  return (
    <div className="search" ref={rootRef}>
      <label htmlFor="title-search">
        {label ?? (session.groupMode ? `Add a title for ${person.name}` : catalogLive ? "Search movies and series" : "Search the shelf")}
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
              if (chosen) commit(chosen);
            }
          }}
        />
        <kbd className="slash">/</kbd>
      </div>
      <div className="search-filters">
        <label className="search-filter">
          Language
          <select
            value={language}
            onChange={(event) => {
              onLanguage(event.target.value);
              setActive(0);
              setOpen(true);
            }}
          >
            <option value="">Any language</option>
            {CATALOG_LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {language ? (
          <label className="search-filter">
            Available as
            <select
              value={audio}
              onChange={(event) => {
                onAudio(event.target.value === "listed" ? "listed" : "original");
                setActive(0);
                setOpen(true);
              }}
            >
              <option value="original">Original language</option>
              <option value="listed">Dub or subtitles listed</option>
            </select>
          </label>
        ) : null}
      </div>
      {language && audio === "listed" ? (
        <p className="hint">TMDB lists a language version. It does not say whether that version is a dub or subtitles.</p>
      ) : null}
      {open ? (
        <div className="results">
          <p className="results-label">
            {searching ? "Searching the catalog…" : usingRemote || browsing ? "From the catalog" : query.trim() || language ? "Matches" : "From the shelf"}
          </p>
          {results.length === 0 ? (
            <p className="results-empty">
              {language && audio === "listed" && !catalogLive
                ? "Dub listings need the live catalog. This shelf can match an original language."
                : usingRemote
                  ? language
                    ? `Nothing matches that in ${languageName(language)}.`
                    : "Nothing in the catalog matches that."
                  : "Nothing on the shelf matches that. Try a director, a year, or a mood."}
            </p>
          ) : (
            <ul id={listId} role="listbox">
              {results.map((title, index) => {
                const reason = addBlockReason(session, title.id);
                const picked = session.order.includes(title.id);
                const full = !picked && reason === "full";
                return (
                  <li
                    key={title.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === safeActive}
                    aria-disabled={full}
                    aria-label={picked ? `Remove ${title.name} from the table` : full ? `${title.name} is not added. The table is full` : `Add ${title.name} to the table`}
                    className={index === safeActive ? "is-active" : ""}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (!full) commit(title);
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
                        {KIND_LABEL[title.kind]} · {title.year || "Undated"} · {title.language}
                        {title.listedIn ? ` · Dub or subtitles listed in ${title.listedIn}` : ""} ·{" "}
                        {title.episodeMinutes
                          ? `${title.episodeMinutes} min episodes`
                          : formatDuration(title.runtimeMinutes, title.approximate)}
                      </span>
                    </span>
                    <span className={picked ? "result-action is-picked" : full ? "result-action is-quiet" : "result-action"} aria-hidden="true">
                      {full ? "Full" : picked ? <Minus size={16} strokeWidth={2.6} /> : <Plus size={16} strokeWidth={2.6} />}
                    </span>
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
