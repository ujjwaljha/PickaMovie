import { Minus, Plus } from "lucide-react";
import { KIND_LABEL } from "../domain/copy";
import { joinNames } from "../domain/format";
import type { SimilarHit } from "../domain/similar";
import type { Title } from "../domain/types";
import { Poster } from "./Poster";

export function SimilarList({
  seeds,
  hits,
  live,
  pickedIds,
  onAdd,
  onRemove,
}: {
  seeds: Title[];
  hits: SimilarHit[];
  live: boolean;
  pickedIds: readonly string[];
  onAdd: (title: Title) => void;
  onRemove: (id: string) => void;
}) {
  if (seeds.length === 0) {
    return (
      <div className="hero">
        <p className="eyebrow">More like these</p>
        <h2>Name a few you already like.</h2>
        <p className="lede">Search a title you already like. Close matches show up here.</p>
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
          {hits.map((hit) => {
            const onTable = pickedIds.includes(hit.title.id);
            return (
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
                <button
                  type="button"
                  className={onTable ? "pick-btn is-picked" : "pick-btn"}
                  aria-pressed={onTable}
                  aria-label={onTable ? `Remove ${hit.title.name} from the table` : `Add ${hit.title.name} to the table`}
                  onClick={() => (onTable ? onRemove(hit.title.id) : onAdd(hit.title))}
                >
                  {onTable ? <Minus size={18} strokeWidth={2.6} /> : <Plus size={18} strokeWidth={2.6} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="shelf-note">{live ? "These come from recommendations for the titles you named." : "These matches are from the sample shelf."}</p>
    </div>
  );
}
