import { watchLine } from "../domain/regions";
import type { Title } from "../domain/types";

const LISTING = /^https:\/\/www\.themoviedb\.org\/[A-Za-z0-9/?=&%._~-]{1,180}$/;

export function WatchLine({ title }: { title: Title }) {
  const watch = title.watch;
  if (!watch) return null;
  const link = watch.link && LISTING.test(watch.link) ? watch.link : "";
  return (
    <p className="where-line">
      {watchLine(watch)}
      {link ? (
        <>
          {" "}
          <a href={link} target="_blank" rel="noreferrer">
            See listing
          </a>
        </>
      ) : null}
    </p>
  );
}
