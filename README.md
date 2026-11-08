# What2Watch

A no-account way to end watchlist paralysis. Put a few movies, series, anime, and animated titles on one table, set the clock and the mood, and compare them side by side. Friends on the same couch can add their own picks. The shortlist stays on the device. Search asks TMDB through this app's server when a catalog key is set, and stays on the sample shelf otherwise.

## Run

```bash
npm install
npm run dev
```

`npm test` covers scoring, search, session persistence, and the TMDB adapter. `npm run build` typechecks and builds the static app.

## How it is put together

```
src/
  App.tsx                  page shell
  components/              search, filters, group couch, comparison, decision ticket
  hooks/useSession.ts      React binding over the session reducer
  data/titles.ts           editorial sample shelf
  data/presets.ts          one-click toss-ups
  domain/scoring.ts        time, mood, company, and group overlap
  domain/search.ts         instant shelf search
  domain/session.ts        reducer, localStorage, and share hash
  services/catalog.ts      sample shelf the UI falls back to
  services/liveCatalog.ts  browser calls to `/api/catalog`
  services/tmdb.ts         maps TMDB payloads into a Title, including posters
  services/library.ts      remembers catalog titles on this device
  server/catalogRoute.ts   allowlisted TMDB proxy
api/catalog.ts             the published route that runs the proxy
```

Search uses TMDB when the server has `TMDB_API_KEY`. The browser calls `/api/catalog` only. The key stays on the server. Posters are loaded from `image.tmdb.org`. Without the key, search stays on the editorial sample shelf and nothing is sent off the device.

This product uses the TMDB API but is not endorsed or certified by TMDB. Scores on catalog titles are the TMDB user score on both axes. Vibe, pacing, and mood fits are inferred from genres. Sample-shelf scores stay editorial.

## Session

The shortlist, each person's mood, group mode, and the last pick are stored in `localStorage` under `what2watch.session.v1`. Your titles and mood are also written to the URL hash (`#w=past-lives.parasite&t=evening`), so a refresh or a pasted link restores that table. Friend names stay on the device.
