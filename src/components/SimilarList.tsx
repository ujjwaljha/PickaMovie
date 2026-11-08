import { KIND_LABEL } from "../domain/copy";
import { joinNames } from "../domain/format";
import type { SimilarHit } from "../domain/similar";
import type { Title } from "../domain/types";
import { Poster } from "./Poster";

export function SimilarList({
  seeds,
  hits,
  live,
  onAdd,
}: {
  seeds: Title[];
  hits: SimilarHit[];
  live: boolean;
  onAdd: (title: Title) => void;
}) {
  if (seeds.length === 0) {
    return (
      <div className="hero">
        <p className="eyebrow">More like these</p>
        <h2>Name a few you already like.</h2>
        <p className="lede">
          Search two or three titles. The closest neighbors on this shelf show up here, matched on vibe, pace, and mood.
        </p>
      </div>
    );
  }

  return (
    <div className="similar">
      <p className="lede">Because you named {joinNames(seeds.map((seed) => seed.name))}.</p>
      {hits.length === 0 ? (
        <p className="hint">Nothing else on this shelf sits close to that mix.</p>
      ) : (
        <ul className="similar-list">
          {hits.map((hit) => (
            <li key={hit.title.id}>
              <Poster title={hit.title} size="sm" />
              <div className="similar-copy">
                <h3>{hit.title.name}</h3>
                <p>
                  {hit.title.year} · {KIND_LABEL[hit.title.kind]}
                </p>
                <p>{hit.reasons.join(" · ")}</p>
              </div>
              <strong className="similar-score">{hit.score}</strong>
              <button type="button" className="btn btn-primary" onClick={() => onAdd(hit.title)}>
                Add to table
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="shelf-note">
        {live
          ? "Matches for a catalog title come from TMDB recommendations, then scored on the same vibe and mood axes. Sample-shelf titles still match inside the shelf."
          : "These matches use the sample shelf. A live catalog would score the same way."}
      </p>
    </div>
  );
}
