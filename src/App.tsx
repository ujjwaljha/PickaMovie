import { useEffect, useMemo, useRef, useState } from "react";
import { PRESETS } from "./data/presets";
import { rankPool } from "./domain/scoring";
import { similarTo, type SimilarHit } from "./domain/similar";
import { filterSummary } from "./domain/copy";
import { actingPerson, voters } from "./domain/session";
import type { Title } from "./domain/types";
import { FilterBar } from "./components/FilterBar";
import { GroupPanel } from "./components/GroupPanel";
import { Header } from "./components/Header";
import { SearchBox } from "./components/SearchBox";
import { Shortlist } from "./components/Shortlist";
import { Stage } from "./components/Stage";
import { useSession } from "./hooks/useSession";
import { catalog } from "./services/catalog";
import { loadLibrary, remember, saveLibrary } from "./services/library";
import { loadBrowse, loadLiveTitles, probeCatalog, recommendLive, type CatalogMode } from "./services/liveCatalog";

export function App() {
  const { session, saved, notice, dispatch, addTitle } = useSession();
  const [focusToken, setFocusToken] = useState(0);
  const [mode, setMode] = useState<"compare" | "similar">("compare");
  const [catalogMode, setCatalogMode] = useState<CatalogMode>("shelf");
  const [library, setLibrary] = useState<Record<string, Title>>(() => loadLibrary(window.localStorage));
  const [remoteHits, setRemoteHits] = useState<SimilarHit[] | null>(null);
  const [discover, setDiscover] = useState<Title[]>([]);
  const revealOnMobile = useRef(false);
  const titles = useMemo(
    () =>
      session.order.flatMap((id) => {
        const title = library[id] ?? catalog.get(id);
        return title ? [title] : [];
      }),
    [library, session.order],
  );
  const person = actingPerson(session);
  const ranked = useMemo(() => rankPool(titles, voters(session)), [titles, session]);
  const shelfHits = useMemo(() => (mode === "similar" ? similarTo(titles, catalog.all()) : []), [mode, titles]);
  const suggestions = remoteHits ?? shelfHits;
  const catalogLive = catalogMode === "live";
  const titleKey = titles.map((title) => title.id).join(".");

  useEffect(() => {
    const controller = new AbortController();
    void probeCatalog(controller.signal).then((next) => {
      if (!controller.signal.aborted) setCatalogMode(next);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!catalogLive) return;
    const controller = new AbortController();
    void loadBrowse(controller.signal).then((found) => {
      if (!controller.signal.aborted && found && found.length > 0) setDiscover(found);
    });
    return () => controller.abort();
  }, [catalogLive]);

  useEffect(() => {
    saveLibrary(window.localStorage, library);
  }, [library]);

  useEffect(() => {
    const missing = session.order.filter((id) => id.startsWith("tmdb-") && !library[id]);
    if (missing.length === 0) return;
    const controller = new AbortController();
    void loadLiveTitles(missing, controller.signal).then((found) => {
      if (controller.signal.aborted || found.length === 0) return;
      setLibrary((current) => remember(current, found, session.order));
    });
    return () => controller.abort();
  }, [library, session.order]);

  useEffect(() => {
    if (mode !== "similar" || !catalogLive) {
      setRemoteHits(null);
      return;
    }
    const seeds = titles.filter((title) => title.id.startsWith("tmdb-"));
    if (seeds.length === 0) {
      setRemoteHits(null);
      return;
    }
    const controller = new AbortController();
    void recommendLive(
      seeds.map((title) => title.id),
      controller.signal,
    ).then((pool) => {
      if (controller.signal.aborted || !pool) return;
      const scored = similarTo(titles, pool);
      setRemoteHits(scored.length > 0 ? scored : pool.slice(0, 6).map((title) => ({ title, score: title.audience, reasons: ["Recommended on TMDB for a title you named"] })));
    });
    return () => controller.abort();
  }, [catalogLive, mode, titleKey, titles]);

  useEffect(() => {
    if (!revealOnMobile.current) return;
    revealOnMobile.current = false;
    if (window.innerWidth >= 1024) return;
    document.getElementById("comparison")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [session.order]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      document.getElementById("title-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const acceptTitle = (title: Title) => {
    setLibrary((current) => remember(current, [title], [...session.order, title.id]));
    revealOnMobile.current = true;
    addTitle(title.id);
    if (!title.id.startsWith("tmdb-")) return;
    void loadLiveTitles([title.id]).then((found) => {
      if (found.length === 0) return;
      setLibrary((current) => remember(current, found, [...session.order, title.id]));
    });
  };

  const weigh = () => {
    if (titles.length < 2) return;
    dispatch({ type: "weigh", titles });
    setFocusToken((value) => value + 1);
  };

  const mood = filterSummary(person.filters);
  const moodLabel = mood === "No preferences" ? "Set time and who's watching" : `Tonight: ${mood}`;

  return (
    <div className="app">
      <a className="skip" href="#title-search">
        Skip to search
      </a>
      <Header saved={saved} canClear={titles.length > 0 || session.groupMode} onClear={() => dispatch({ type: "reset" })} />
      <main className="page">
        <SearchBox
          session={session}
          catalogLive={catalogLive}
          discover={discover}
          label={mode === "similar" ? "Name something you like" : "Search a movie or series"}
          onAdd={acceptTitle}
          onRemove={(titleId) => dispatch({ type: "remove", titleId })}
        />
        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}
        {titles.length > 0 ? (
          <section className="picks" aria-label="Your picks">
            <div className="picks-head">
              <h2>
                Your picks <span>{titles.length}/4</span>
              </h2>
              <div className="stage-actions">
                {mode === "compare" && titles.length > 1 ? (
                  <button type="button" className="btn btn-primary" onClick={weigh}>
                    Help me pick
                  </button>
                ) : null}
                {mode === "similar" || titles.length > 1 ? (
                  <button type="button" className="text-link" onClick={() => setMode(mode === "similar" ? "compare" : "similar")}>
                    {mode === "similar" ? "Back to your picks" : "More like these"}
                  </button>
                ) : null}
              </div>
            </div>
            {mode === "compare" && titles.length === 1 ? <p className="hint">Add one more, then ask for a pick.</p> : null}
            {mode === "similar" ? (
              <Shortlist titles={titles} people={session.people} groupMode={session.groupMode} onRemove={(titleId) => dispatch({ type: "remove", titleId })} />
            ) : null}
          </section>
        ) : null}
        <Stage
          session={session}
          titles={titles}
          ranked={ranked}
          focusToken={focusToken}
          mode={mode}
          suggestions={suggestions}
          liveMatches={remoteHits !== null}
          discover={discover}
          extras={
            titles.length > 1 || session.groupMode || mood !== "No preferences" ? (
              <details className="drawer">
                <summary>{moodLabel}</summary>
                <FilterBar
                  filters={person.filters}
                  legend={person.id === "you" ? "Tonight" : `${person.name} tonight`}
                  onChange={(filters) => dispatch({ type: "set-filters", filters })}
                />
                <GroupPanel
                  session={session}
                  onEnable={() => {
                    if (session.people.length < 2) dispatch({ type: "add-person" });
                    else dispatch({ type: "toggle-group" });
                  }}
                  onDisable={() => dispatch({ type: "toggle-group" })}
                  onAddPerson={() => dispatch({ type: "add-person" })}
                  onRemovePerson={(personId) => dispatch({ type: "remove-person", personId })}
                  onRename={(personId, name) => dispatch({ type: "rename-person", personId, name })}
                  onActivate={(personId) => dispatch({ type: "set-active", personId })}
                />
              </details>
            ) : null
          }
          onRemove={(titleId) => dispatch({ type: "remove", titleId })}
          onAdd={acceptTitle}
        />
        {titles.length === 0 && mode === "compare" ? (
          <details className="drawer">
            <summary>Start with a set</summary>
            <div className="preset-chips">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    revealOnMobile.current = true;
                    setMode("compare");
                    dispatch({ type: "load-preset", presetId: preset.id });
                  }}
                >
                  {preset.title}
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </main>
      <footer className="page-foot">
        <p>{catalogLive ? "Posters and scores come from TMDB. Your picks stay on this device." : "This shelf is a sample until a catalog key is added. Your picks stay on this device."}</p>
      </footer>
    </div>
  );
}
