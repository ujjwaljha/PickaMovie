import { afterEach, describe, expect, it } from "vitest";
import handler from "../../api/catalog";
import { allowedTmdbPath, CATALOG_MINUTE_LIMIT, GET, resetCatalogLimits } from "./catalogRoute";

const originalFetch = globalThis.fetch;

function env(): Record<string, string | undefined> {
  return ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {});
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete env().TMDB_API_KEY;
  resetCatalogLimits();
});

describe("TMDB catalog route", () => {
  it("builds only fixed TMDB paths", () => {
    expect(allowedTmdbPath("https://app.example/api/catalog?op=status")).toBe("");
    expect(allowedTmdbPath("https://app.example/api/catalog?op=browse")).toBe("");
    expect(allowedTmdbPath("https://app.example/api/catalog?op=search&q=spirited%20away")).toBe(
      "/3/search/multi?query=spirited%20away&include_adult=false&language=en-US",
    );
    expect(allowedTmdbPath("https://app.example/api/catalog?op=title&media=movie&id=129")).toBe(
      "/3/movie/129?append_to_response=credits&language=en-US",
    );
    expect(allowedTmdbPath("https://app.example/api/catalog?op=similar&media=tv&id=1396")).toBe(
      "/3/tv/1396/recommendations?language=en-US",
    );
    expect(allowedTmdbPath("https://app.example/api/catalog?op=title&media=person&id=1")).toBeNull();
    expect(allowedTmdbPath("https://app.example/api/catalog?op=title&media=movie&id=../configuration")).toBeNull();
    expect(allowedTmdbPath("https://app.example/api/catalog?op=search&q=")).toBeNull();
    expect(allowedTmdbPath("https://evil.example/?op=search&q=x")).toContain("/3/search/multi?query=x");
  });

  it("says the catalog is not configured when the key is absent and does not call out", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response("no");
    };
    const response = await GET(new Request("https://app.example/api/catalog?op=status"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ configured: false });
    expect(called).toBe(false);
  });

  it("sends the key only upstream and never echoes it", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const response = await GET(new Request("https://app.example/api/catalog?op=search&q=spirited"));
    const body = await response.json();
    expect(body).toEqual({ configured: true, payload: { results: [] } });
    expect(calls[0]).toContain("https://api.themoviedb.org/3/search/multi?");
    expect(calls[0]).toContain("api_key=shelf-test-key");
    expect(JSON.stringify(body)).not.toContain("shelf-test-key");
    expect(response.headers.get("cache-control")).toContain("max-age=300");
  });

  it("uses a bearer header for a read token and refuses a bad id before calling out", async () => {
    env().TMDB_API_KEY = "ey-test-token";
    const calls: { url: string; authorization: string | null }[] = [];
    globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), authorization: headers.get("authorization") });
      return new Response(JSON.stringify({ id: 129, title: "Spirited Away" }), { status: 200 });
    };
    const blocked = await GET(new Request("https://app.example/api/catalog?op=title&media=movie&id=1%2Faccount"));
    expect(blocked.status).toBe(400);
    expect(calls).toHaveLength(0);

    const response = await GET(new Request("https://app.example/api/catalog?op=title&media=movie&id=129"));
    expect(response.status).toBe(200);
    expect(calls[0]?.url).not.toContain("api_key");
    expect(calls[0]?.url).not.toContain("ey-test-token");
    expect(calls[0]?.authorization).toBe("Bearer ey-test-token");
    expect(JSON.stringify(await response.json())).not.toContain("ey-test-token");
  });

  it("stops calling TMDB after the shared per-minute cap", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };
    for (let i = 0; i < CATALOG_MINUTE_LIMIT; i += 1) {
      const ok = await GET(new Request(`https://app.example/api/catalog?op=search&q=cap${i}`));
      expect(ok.status).toBe(200);
    }
    const blocked = await GET(new Request("https://app.example/api/catalog?op=search&q=cap-over"));
    expect(blocked.status).toBe(429);
    expect(calls).toBe(CATALOG_MINUTE_LIMIT);
    expect(JSON.stringify(await blocked.json())).not.toContain("shelf-test-key");
  });

  it("does not open a new window when X-Forwarded-For changes", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };
    for (let i = 0; i < CATALOG_MINUTE_LIMIT; i += 1) {
      const ok = await GET(
        new Request(`https://app.example/api/catalog?op=search&q=xff${i}`, {
          headers: { "x-forwarded-for": `203.0.113.${i % 250}, 10.0.0.${i % 20}` },
        }),
      );
      expect(ok.status).toBe(200);
    }
    const blocked = await GET(
      new Request("https://app.example/api/catalog?op=search&q=xff-over", {
        headers: { "x-forwarded-for": "198.51.100.20" },
      }),
    );
    expect(blocked.status).toBe(429);
    expect(calls).toBe(CATALOG_MINUTE_LIMIT);
  });

  it("merges the home lists, drops people, and keeps the key upstream", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      const url = String(input);
      if (url.includes("/trending/")) {
        return Response.json({
          results: [
            { id: 129, media_type: "movie", title: "Spirited Away", poster_path: "/spirited.jpg", vote_count: 12000, genre_ids: [16] },
            { id: 9, media_type: "person", name: "Someone" },
            { id: 129, media_type: "movie", title: "Spirited Away", poster_path: "https://evil.example/x.jpg" },
          ],
        });
      }
      if (url.includes("/movie/popular")) {
        return Response.json({ results: [{ id: 129, title: "Spirited Away", poster_path: "/spirited.jpg" }] });
      }
      return Response.json({
        results: [{ id: 1396, name: "Breaking Bad", poster_path: "/bb.jpg", vote_average: 8.9 }],
      });
    };
    const response = await GET(new Request("https://app.example/api/catalog?op=browse"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age=3600");
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.startsWith("https://api.themoviedb.org/3/") && call.includes("api_key=shelf-test-key"))).toBe(true);
    expect(body.payload.results.map((item: { id: number; media_type: string; poster_path: string | null }) => [item.media_type, item.id, item.poster_path])).toEqual([
      ["movie", 129, "/spirited.jpg"],
      ["tv", 1396, "/bb.jpg"],
    ]);
    expect(JSON.stringify(body)).not.toContain("shelf-test-key");
    expect(JSON.stringify(body)).not.toContain("evil.example");
    const again = await GET(new Request("https://app.example/api/catalog?op=browse"));
    expect(again.status).toBe(200);
    expect(calls).toHaveLength(3);
    expect(await again.json()).toEqual(body);
  });

  it("does not call TMDB again for a repeated search", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ results: [{ id: 129, media_type: "movie", title: "Spirited Away", poster_path: "/spirited.jpg" }] }), { status: 200 });
    };
    const first = await GET(new Request("https://app.example/api/catalog?op=search&q=spirited"));
    const firstBody = await first.json();
    const second = await GET(new Request("https://app.example/api/catalog?op=search&q=spirited"));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstBody);
    expect(calls).toBe(1);
  });

  it("answers the host's Node-style call", async () => {
    let body = "";
    const res = {
      statusCode: 0,
      setHeader() {},
      end(value?: string) {
        body = value ?? "";
      },
    };
    await handler({ url: "/api/catalog?op=status", method: "GET", headers: { host: "app.example" } }, res);
    expect(res.statusCode).toBe(200);
    expect(body).toContain('"configured":false');
  });
});
