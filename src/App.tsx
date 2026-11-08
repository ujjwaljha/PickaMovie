import { useEffect, useMemo, useRef, useState } from "react";
import { PRESETS } from "./data/presets";
import { rankPool } from "./domain/scoring";
import { similarTo, type SimilarHit } from "./domain/similar";
import { joinNames } from "./domain/format";
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

  const legend = person.id === "you" ? "Your mood" : `${person.name}'s mood`;

  return (
    <div className={titles.length > 0 && mode === "compare" ? "app has-dock" : "app"}>
      <a className="skip" href="#comparison">
        Skip to comparison
      </a>
      <Header
        saved={saved}
        question={mode === "similar" ? "What do you already like?" : "What are we deciding?"}
        onClear={() => dispatch({ type: "reset" })}
      />
      <main className="mx-auto grid w-full max-w-[88rem] gap-8 px-4 py-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <section className="console" aria-label="Filters and shortlist">
          <SearchBox
            session={session}
            catalogLive={catalogLive}
            discover={discover}
            label={mode === "similar" && !session.groupMode ? "Name a title you like" : undefined}
            onAdd={acceptTitle}
          />
          {notice ? (
            <p className="notice" role="status">
              {notice}
            </p>
          ) : null}
          <p className="hint">
            {mode === "similar"
              ? catalogLive
                ? "Name a few titles you already like. Catalog titles bring recommendations. Shelf titles match inside the sample shelf."
                : "Name a few titles you already like. More like these stays on this shelf."
              : session.groupMode
                ? `Search adds to ${person.name}. Weigh and pick balances every mood on the couch.`
                : "Set the clock, the energy, and the company. Then put two or more titles side by side."}
          </p>
          <FilterBar
            filters={person.filters}
            legend={legend}
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
          <Shortlist titles={titles} people={session.people} groupMode={session.groupMode} onRemove={(titleId) => dispatch({ type: "remove", titleId })} />
          {titles.length > 0 ? (
            <div className="toss-row">
              <p>Or load a toss-up</p>
              <div>
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      revealOnMobile.current = true;
                      dispatch({ type: "load-preset", presetId: preset.id });
                    }}
                  >
                    {preset.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
        <Stage
          session={session}
          titles={titles}
          ranked={ranked}
          focusToken={focusToken}
          mode={mode}
          onMode={setMode}
          suggestions={suggestions}
          liveMatches={remoteHits !== null}
          discover={discover}
          onPreset={(presetId) => {
            revealOnMobile.current = true;
            dispatch({ type: "load-preset", presetId });
          }}
          onRemove={(titleId) => dispatch({ type: "remove", titleId })}
          onAdd={acceptTitle}
          onWeigh={weigh}
        />
      </main>
      <footer className="mx-auto w-full max-w-[88rem] px-4 pb-16 pt-4">
        <p>
          {catalogLive
            ? `The screen loads current movies and series from TMDB, with posters, scores, cast, and the other details TMDB publishes. Toss-ups still use the sample shelf of ${catalog.all().length} titles. This product uses the TMDB API but is not endorsed or certified by TMDB.`
            : `${catalog.label} of ${catalog.all().length} titles. Scores, vibes, and mood fits are curated so a decision works before a catalog key is set.`}
        </p>
        <p>
          {catalogLive
            ? "Your shortlist, moods, and couch mates stay in this browser. A search query is sent to this app so it can ask TMDB. The shortlist itself is not uploaded."
            : "Your shortlist, moods, and couch mates stay in this browser. A refresh keeps them. Nothing is sent anywhere."}
        </p>
        <p className="footer-credit">
          {session.groupMode ? `On the couch: ${joinNames(session.people.map((person) => person.name))}.` : "Watching solo."}
        </p>
      </footer>
      {titles.length > 0 && mode === "compare" ? (
        <div className="dock">
          {titles.length < 2 ? (
            <p>Add one more title to compare.</p>
          ) : (
            <button type="button" className="btn btn-primary weigh-btn" onClick={weigh}>
              Weigh and pick
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
