import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function catalogDevApi(): Plugin {
  return {
    name: "catalog-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/catalog")) {
          next();
          return;
        }
        void (async () => {
          try {
            const mod = (await server.ssrLoadModule("/src/server/catalogRoute.ts")) as {
              GET: (request: Request) => Promise<Response>;
            };
            const request = new Request(new URL(url, "http://127.0.0.1"), { method: req.method ?? "GET" });
            const upstream = await mod.GET(request);
            const response = await previewCatalog(url, upstream);
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ configured: false }));
          }
        })();
      });
    },
  };
}

// Dev server only. The published route never uses this. It lets this machine
// show poster layout when TMDB_API_KEY is not present here.
const PREVIEW_TITLES = [
  {
    id: 155,
    media_type: "movie",
    title: "The Dark Knight",
    overview: "Batman raises the stakes in his war on crime.",
    vote_average: 8.5,
    vote_count: 32000,
    genre_ids: [28, 80, 18],
    genres: [
      { id: 28, name: "Action" },
      { id: 80, name: "Crime" },
    ],
    release_date: "2008-07-16",
    original_language: "en",
    poster_path: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    runtime: 152,
    credits: { crew: [{ job: "Director", name: "Christopher Nolan" }], cast: [{ name: "Christian Bale" }, { name: "Heath Ledger" }] },
  },
  {
    id: 157336,
    media_type: "movie",
    title: "Interstellar",
    overview: "A team of explorers travel through a wormhole in space.",
    vote_average: 8.4,
    vote_count: 28000,
    genre_ids: [12, 18, 878],
    genres: [
      { id: 12, name: "Adventure" },
      { id: 878, name: "Science Fiction" },
    ],
    release_date: "2014-11-05",
    original_language: "en",
    poster_path: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    runtime: 169,
    credits: { crew: [{ job: "Director", name: "Christopher Nolan" }], cast: [{ name: "Matthew McConaughey" }] },
  },
  {
    id: 496243,
    media_type: "movie",
    title: "Parasite",
    overview: "Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.",
    vote_average: 8.5,
    vote_count: 18000,
    genre_ids: [35, 53, 18],
    genres: [
      { id: 35, name: "Comedy" },
      { id: 53, name: "Thriller" },
    ],
    release_date: "2019-05-30",
    original_language: "ko",
    poster_path: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    runtime: 133,
    credits: { crew: [{ job: "Director", name: "Bong Joon-ho" }], cast: [{ name: "Song Kang-ho" }] },
  },
  {
    id: 129,
    media_type: "movie",
    title: "Spirited Away",
    overview: "A girl wanders into a world ruled by gods, witches, and spirits.",
    vote_average: 8.5,
    vote_count: 16000,
    genre_ids: [16, 14, 10751],
    genres: [
      { id: 16, name: "Animation" },
      { id: 14, name: "Fantasy" },
    ],
    release_date: "2001-07-20",
    original_language: "ja",
    poster_path: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
    runtime: 125,
    credits: { crew: [{ job: "Director", name: "Hayao Miyazaki" }], cast: [{ name: "Rumi Hiiragi" }] },
  },
];

async function previewCatalog(url: string, upstream: Response): Promise<Response> {
  const body = (await upstream.clone().json().catch(() => null)) as { configured?: boolean } | null;
  if (!body || body.configured !== false) return upstream;
  const params = new URL(url, "http://127.0.0.1").searchParams;
  const op = params.get("op");
  if (op === "status") return Response.json({ configured: true });
  if (op === "browse") return Response.json({ configured: true, payload: { results: PREVIEW_TITLES } });
  if (op === "search") {
    const query = (params.get("q") ?? "").toLowerCase();
    const results = PREVIEW_TITLES.filter((item) => item.title.toLowerCase().includes(query));
    return Response.json({ configured: true, payload: { results } });
  }
  if (op === "title") {
    const id = Number(params.get("id"));
    const media = params.get("media");
    const found = PREVIEW_TITLES.find((item) => item.id === id && item.media_type === media);
    if (!found) return Response.json({ configured: true, error: "upstream" }, { status: 502 });
    return Response.json({ configured: true, payload: found });
  }
  return upstream;
}

export default defineConfig({
  plugins: [react(), tailwindcss(), catalogDevApi()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
