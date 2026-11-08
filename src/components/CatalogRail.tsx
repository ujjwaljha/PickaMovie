import { KIND_LABEL } from "../domain/copy";
import type { Title } from "../domain/types";
import { Poster } from "./Poster";

export function CatalogRail({ titles, onAdd }: { titles: Title[]; onAdd: (title: Title) => void }) {
  if (titles.length === 0) return null;
  return (
    <div className="rail-block">
      <p className="eyebrow">In the catalog</p>
      <h2>Movies and series playing now</h2>
      <ul className="rail">
        {titles.map((title) => (
          <li key={title.id}>
            <button type="button" onClick={() => onAdd(title)}>
              <Poster title={title} size="md" />
              <span className="rail-name">{title.name}</span>
              <span className="rail-meta">
                {title.year || "Undated"} · {KIND_LABEL[title.kind]}
                {title.audience ? ` · ${title.audience}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
