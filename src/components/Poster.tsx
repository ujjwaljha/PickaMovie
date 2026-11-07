import { KIND_LABEL } from "../domain/copy";
import type { Title } from "../domain/types";

export function Poster({ title, size = "md" }: { title: Title; size?: "sm" | "md" }) {
  return (
    <div
      className={`poster poster-${size}`}
      style={{
        background: `linear-gradient(${title.angle}deg, ${title.palette[0]} 0%, ${title.palette[1]} 78%)`,
      }}
      aria-hidden="true"
    >
      <span className="poster-kind">{KIND_LABEL[title.kind]}</span>
      <span className="poster-mark">{title.mark}</span>
    </div>
  );
}
