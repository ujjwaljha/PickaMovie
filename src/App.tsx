import { useEffect, useMemo, useRef, useState } from "react";
import { PRESETS } from "./data/presets";
import { rankPool } from "./domain/scoring";
import { joinNames } from "./domain/format";
import { actingPerson, voters } from "./domain/session";
import { FilterBar } from "./components/FilterBar";
import { GroupPanel } from "./components/GroupPanel";
import { Header } from "./components/Header";
import { SearchBox } from "./components/SearchBox";
import { Shortlist } from "./components/Shortlist";
import { Stage } from "./components/Stage";
import { useSession } from "./hooks/useSession";
import { catalog } from "./services/catalog";

export function App() {
  const { session, saved, notice, dispatch, addTitle } = useSession();
  const [focusToken, setFocusToken] = useState(0);
  const revealOnMobile = useRef(false);
  const titles = catalog.getMany(session.order);
  const person = actingPerson(session);
  const ranked = useMemo(() => rankPool(titles, voters(session)), [titles, session]);

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

  const weigh = () => {
    if (titles.length < 2) return;
    dispatch({ type: "weigh" });
    setFocusToken((value) => value + 1);
  };

  const legend = person.id === "you" ? "Your mood" : `${person.name}'s mood`;

  return (
    <div className={titles.length > 0 ? "app has-dock" : "app"}>
      <a className="skip" href="#comparison">
        Skip to comparison
      </a>
      <Header saved={saved} onClear={() => dispatch({ type: "reset" })} />
      <main className="mx-auto grid w-full max-w-[88rem] gap-8 px-4 py-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <section className="console" aria-label="Build the shortlist">
          <div>
            <p className="eyebrow">The table</p>
            <h2 className="console-title">What are we deciding?</h2>
          </div>
          <SearchBox
            session={session}
            onAdd={(id) => {
              revealOnMobile.current = true;
              addTitle(id);
            }}
          />
          {notice ? (
            <p className="notice" role="status">
              {notice}
            </p>
          ) : null}
          <p className="hint">
            {session.groupMode
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
          onPreset={(presetId) => {
            revealOnMobile.current = true;
            dispatch({ type: "load-preset", presetId });
          }}
          onRemove={(titleId) => dispatch({ type: "remove", titleId })}
          onWeigh={weigh}
        />
      </main>
      <footer className="mx-auto w-full max-w-[88rem] px-4 pb-16 pt-4">
        <p>
          {catalog.label} of {catalog.all().length} titles. Scores, vibes, and mood fits are curated so a decision works with no account and no network.
        </p>
        <p>Your shortlist, moods, and couch mates stay in this browser. A refresh keeps them. Nothing is sent anywhere.</p>
        <p className="footer-credit">
          {session.groupMode ? `On the couch: ${joinNames(session.people.map((person) => person.name))}.` : "Watching solo."}
        </p>
      </footer>
      {titles.length > 0 ? (
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
