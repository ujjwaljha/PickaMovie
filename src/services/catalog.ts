import { TITLE_BY_ID, TITLES } from "../data/titles";
import { rankTitles } from "../domain/search";
import type { Title } from "../domain/types";

/**
 * Active catalog. This build uses the editorial sample shelf so the app works
 * with no account and no API key. To go live, map TMDB through `createTmdbSource`
 * on a server that holds the key, then adapt these methods to that source.
 * Do not put a TMDB key in client code.
 */
export const catalog = {
  label: "Editorial sample shelf",
  all(): readonly Title[] {
    return TITLES;
  },
  search(query: string): Title[] {
    return rankTitles(query, TITLES);
  },
  get(id: string): Title | undefined {
    return TITLE_BY_ID.get(id);
  },
  getMany(ids: readonly string[]): Title[] {
    return ids.flatMap((id) => {
      const title = TITLE_BY_ID.get(id);
      return title ? [title] : [];
    });
  },
};
