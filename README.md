# What2Watch

A no-account way to end watchlist paralysis. Put a few movies, series, anime, and animated titles on one table, set the clock and the mood, and compare them side by side. Friends on the same couch can add their own picks. Nothing leaves the browser.

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
  services/catalog.ts      what the UI reads
  services/tmdb.ts         optional adapter for a server-side TMDB proxy
```

The running app uses the sample shelf in `catalog.ts`. Scores, vibes, and mood fits are editorial, so the comparison works with no key and no network. They are not live critic or audience ratings.

`createTmdbSource` maps TMDB search and detail payloads into the same `Title` shape. Give it a fetcher that calls your own proxy. Keep the API key on that server. Do not put a TMDB key in client code.

## Session

The shortlist, each person's mood, group mode, and the last pick are stored in `localStorage` under `what2watch.session.v1`. Your titles and mood are also written to the URL hash (`#w=past-lives.parasite&t=evening`), so a refresh or a pasted link restores that table. Friend names stay on the device.
