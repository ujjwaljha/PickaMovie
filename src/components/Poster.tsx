import { useState } from "react";
import { KIND_LABEL } from "../domain/copy";
import type { Title } from "../domain/types";

const POSTER_SRC = /^https:\/\/image\.tmdb\.org\/t\/p\/w342\/[A-Za-z0-9._-]{1,180}$/;

export function Poster({ title, size = "md" }: { title: Title; size?: "sm" | "md" }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const candidate = title.posterUrl && POSTER_SRC.test(title.posterUrl) ? title.posterUrl : undefined;
  const posterUrl = candidate && candidate !== failedSrc ? candidate : undefined;
  return (
    <div
      className={`poster poster-${size}${posterUrl ? " is-photo" : ""}`}
      style={{
        background: `linear-gradient(${title.angle}deg, ${title.palette[0]} 0%, ${title.palette[1]} 78%)`,
      }}
      aria-hidden="true"
    >
      {posterUrl ? <img src={posterUrl} alt="" onError={() => setFailedSrc(posterUrl)} /> : null}
      <span className="poster-kind">{KIND_LABEL[title.kind]}</span>
      <span className="poster-mark">{title.mark}</span>
    </div>
  );
}
