import { Minus, Plus } from "lucide-react";
import { KIND_LABEL } from "../domain/copy";
import type { Title } from "../domain/types";
import { Poster } from "./Poster";

export function CatalogRail({
  titles,
  pickedIds,
  onAdd,
  onRemove,
}: {
  titles: Title[];
  pickedIds: readonly string[];
  onAdd: (title: Title) => void;
  onRemove: (id: string) => void;
}) {
  if (titles.length === 0) return null;
  const picked = new Set(pickedIds);
  return (
    <div className="rail-block">
      <p className="eyebrow">In the catalog</p>
      <h2>Movies and series playing now</h2>
      <ul className="rail">
        {titles.map((title) => {
          const onTable = picked.has(title.id);
          return (
            <li key={title.id}>
              <button
                type="button"
                className={onTable ? "rail-card is-picked" : "rail-card"}
                aria-pressed={onTable}
                aria-label={onTable ? `Remove ${title.name} from the table` : `Add ${title.name} to the table`}
                onClick={() => (onTable ? onRemove(title.id) : onAdd(title))}
              >
                <span className="rail-poster">
                  <Poster title={title} size="md" />
                  <span className="rail-toggle" aria-hidden="true">
                    <span className="rail-badge">{onTable ? <Minus size={26} strokeWidth={2.6} /> : <Plus size={26} strokeWidth={2.6} />}</span>
                  </span>
                </span>
                <span className="rail-name">{title.name}</span>
                <span className="rail-meta">
                  {title.year || "Undated"} · {KIND_LABEL[title.kind]}
                  {title.audience ? ` · ${title.audience}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
