import { afterEach, describe, expect, it } from "vitest";
import handler from "../../api/catalog";
import { CATALOG_LANGUAGES } from "../domain/languages";
import { WATCH_REGIONS } from "../domain/regions";
import {
  allowedTmdbPath,
  CATALOG_ACTIVE_CLIENTS_PER_HOUR,
  CATALOG_CLIENT_HOUR_LIMIT,
  CATALOG_CLIENT_MINUTE_LIMIT,
  CATALOG_HOUR_LIMIT,
  CATALOG_LANGUAGE_CODES,
  CATALOG_MINUTE_LIMIT,
  CATALOG_NEW_CLIENTS_PER_MINUTE,
  CATALOG_REGION_CODES,
  CATALOG_SPENDERS_PER_MINUTE,
  GET,
  resetCatalogLimits,
  setCatalogClock,
} from "./catalogRoute";

const originalFetch = globalThis.fetch;

function env(): Record<string, string | undefined> {
  return ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {});
}

function search(query: string, cookie: string): Request {
  return new Request(`https://app.example/api/catalog?op=search&q=${query}`, { headers: { cookie } });
}

async function issuedCookie(): Promise<string> {
  const response = await GET(new Request("https://app.example/api/catalog?op=status"));
  const issued = response.headers.get("set-cookie") ?? "";
  expect(issued).toContain("HttpOnly");
  expect(issued).not.toContain("shelf-test-key");
  return issued.split(";")[0] ?? "";
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
      "/3/movie/129?append_to_response=credits,watch/providers&language=en-US",
    );
    expect(allowedTmdbPath("https://app.example/api/catalog?op=similar&media=tv&id=1396")).toBe(
      "/3/tv/1396/recommendations?language=en-US",
    );
    expect(allowedTmdbPath("https://app.example/api/catalog?op=title&media=person&id=1")).toBeNull();
    expect(allowedTmdbPath("https://app.example/api/catalog?op=title&media=movie&id=../configuration")).toBeNull();
    expect(allowedTmdbPath("https://app.example/api/catalog?op=search&q=")).toBeNull();
    expect(allowedTmdbPath("https://app.example/api/catalog?op=search&q=a")).toBeNull();
    expect(allowedTmdbPath("https://app.example/api/catalog?op=search&q=Spirited%20%20Away")).toBe(
      "/3/search/multi?query=spirited%20away&include_adult=false&language=en-US",
    );
    expect(allowedTmdbPath("https://evil.example/?op=search&q=xy")).toContain("/3/search/multi?query=xy");
    expect(allowedTmdbPath("https://app.example/api/catalog?op=search&q=spirited&lang=nope")).toBeNull();
    expect(allowedTmdbPath("https://app.example/api/catalog?op=language&lang=hi")).toBe("");
    expect(allowedTmdbPath("https://app.example/api/catalog?op=language&lang=hi&audio=listed")).toBeNull();
    expect([...CATALOG_LANGUAGE_CODES]).toEqual(CATALOG_LANGUAGES.map((language) => language.code));
    expect([...CATALOG_REGION_CODES]).toEqual(WATCH_REGIONS.map((region) => region.code));
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
    const response = await GET(search("spirited", await issuedCookie()));
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

    const response = await GET(
      new Request("https://app.example/api/catalog?op=title&media=movie&id=129", { headers: { cookie: await issuedCookie() } }),
    );
    expect(response.status).toBe(200);
    expect(decodeURIComponent(calls[0]?.url ?? "")).toContain("append_to_response=credits,watch/providers");
    expect(calls[0]?.url).not.toContain("api_key");
    expect(calls[0]?.url).not.toContain("ey-test-token");
    expect(calls[0]?.authorization).toBe("Bearer ey-test-token");
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("ey-test-token");
    expect(body).not.toContain("watch_offers");
  });

  it("returns one country's streaming names from the same title lookup", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          id: 129,
          title: "Spirited Away",
          "watch/providers": {
            results: {
              IN: {
                link: "https://www.themoviedb.org/movie/129/watch?locale=IN",
                flatrate: [
                  { provider_name: "Netflix", display_priority: 1 },
                  { provider_name: "JioHotstar", display_priority: 0 },
                ],
              },
              US: {
                link: "javascript:alert(1)",
                flatrate: [{ provider_name: "Hulu", display_priority: 2 }],
              },
              ZZ: { flatrate: [{ provider_name: "Secret Stream", display_priority: 0 }] },
            },
          },
        }),
        { status: 200 },
      );
    };
    const cookie = await issuedCookie();
    const blocked = await GET(new Request("https://app.example/api/catalog?op=title&media=movie&id=129&region=ZZ", { headers: { cookie } }));
    expect(blocked.status).toBe(400);
    expect(calls).toBe(0);

    const india = await GET(new Request("https://app.example/api/catalog?op=title&media=movie&id=129&region=in", { headers: { cookie } }));
    const indiaBody = await india.json();
    expect(india.status).toBe(200);
    expect(indiaBody.payload.watch).toEqual({
      region: "IN",
      link: "https://www.themoviedb.org/movie/129/watch?locale=IN",
      flatrate: ["JioHotstar", "Netflix"],
    });
    expect(JSON.stringify(indiaBody)).not.toContain("Hulu");
    expect(JSON.stringify(indiaBody)).not.toContain("Secret Stream");
    expect(JSON.stringify(indiaBody)).not.toContain("watch_offers");

    const states = await GET(new Request("https://app.example/api/catalog?op=title&media=movie&id=129&region=US", { headers: { cookie } }));
    const statesBody = await states.json();
    expect(statesBody.payload.watch).toEqual({ region: "US", flatrate: ["Hulu"] });
    expect(JSON.stringify(statesBody)).not.toContain("javascript:");
    expect(calls).toBe(1);
  });

  it("keeps every browser allowance under the shared ceiling", () => {
    expect(CATALOG_SPENDERS_PER_MINUTE * CATALOG_CLIENT_MINUTE_LIMIT).toBeLessThan(CATALOG_MINUTE_LIMIT);
    expect(CATALOG_ACTIVE_CLIENTS_PER_HOUR * CATALOG_CLIENT_HOUR_LIMIT).toBeLessThan(CATALOG_HOUR_LIMIT);
    expect(CATALOG_NEW_CLIENTS_PER_MINUTE).toBeLessThanOrEqual(CATALOG_SPENDERS_PER_MINUTE);
  });

  it("stops a third browser from spending in the same minute", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    let calls = 0;
    let now = 1_700_000_000_000;
    setCatalogClock(() => now);
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };
    const first = [await issuedCookie(), await issuedCookie()];
    for (const [index, cookie] of first.entries()) {
      expect((await GET(search(`min-a-${index}`, cookie))).status).toBe(200);
    }
    now += 61_000;
    const second = [await issuedCookie(), await issuedCookie()];
    for (const [index, cookie] of second.entries()) {
      expect((await GET(search(`min-b-${index}`, cookie))).status).toBe(200);
    }
    now += 61_000;
    for (const [index, cookie] of first.entries()) {
      expect((await GET(search(`min-c-${index}`, cookie))).status).toBe(200);
    }
    const blocked = await GET(search("min-third", second[0] ?? ""));
    expect(blocked.status).toBe(429);
    expect((await GET(search("min-same", first[0] ?? ""))).status).toBe(200);
    expect(calls).toBe(first.length + second.length + first.length + 1);
    expect(calls).toBeLessThan(CATALOG_MINUTE_LIMIT);
    expect(JSON.stringify(await blocked.json())).not.toContain("shelf-test-key");
  });

  it("stops new browsers before they can spend the whole shared minute", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };
    const admitted = [];
    for (let i = 0; i < CATALOG_NEW_CLIENTS_PER_MINUTE; i += 1) admitted.push(await issuedCookie());
    for (const cookie of admitted) {
      for (let i = 0; i < CATALOG_CLIENT_MINUTE_LIMIT; i += 1) {
        const ok = await GET(search(`cap-${cookie.slice(-4)}-${i}`, cookie));
        expect(ok.status).toBe(200);
      }
    }
    const extra = await issuedCookie();
    const blocked = await GET(search("cap-extra", extra));
    expect(blocked.status).toBe(429);
    expect(JSON.stringify(await blocked.json())).not.toContain("shelf-test-key");
    expect(calls).toBe(CATALOG_NEW_CLIENTS_PER_MINUTE * CATALOG_CLIENT_MINUTE_LIMIT);
    expect(calls).toBeLessThan(CATALOG_MINUTE_LIMIT);
    const again = await GET(search("cap-extra", admitted[0] ?? ""));
    expect(again.status).toBe(429);
    expect(calls).toBe(CATALOG_NEW_CLIENTS_PER_MINUTE * CATALOG_CLIENT_MINUTE_LIMIT);
  });

  it("lets only a few browsers spend during one hour", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    let calls = 0;
    let now = 1_700_000_000_000;
    setCatalogClock(() => now);
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };
    const early = [await issuedCookie(), await issuedCookie()];
    for (const [index, cookie] of early.entries()) {
      const ok = await GET(search(`hour-a-${index}`, cookie));
      expect(ok.status).toBe(200);
    }
    now += 61_000;
    const later = [await issuedCookie(), await issuedCookie()];
    for (const [index, cookie] of later.entries()) {
      const ok = await GET(search(`hour-b-${index}`, cookie));
      expect(ok.status).toBe(200);
    }
    now += 60 * 60 * 1000;
    const returning = [...early, ...later];
    for (const [index, cookie] of returning.slice(0, CATALOG_SPENDERS_PER_MINUTE).entries()) {
      const ok = await GET(search(`hour-c-${index}`, cookie));
      expect(ok.status).toBe(200);
    }
    const waiting = await GET(search("hour-wait", returning[CATALOG_SPENDERS_PER_MINUTE] ?? ""));
    expect(waiting.status).toBe(429);
    now += 61_000;
    for (const [index, cookie] of returning.slice(CATALOG_SPENDERS_PER_MINUTE).entries()) {
      const ok = await GET(search(`hour-d-${index}`, cookie));
      expect(ok.status).toBe(200);
    }
    const extra = await issuedCookie();
    const blocked = await GET(search("hour-extra", extra));
    expect(blocked.status).toBe(429);
    expect(calls).toBe(early.length + later.length + returning.length);
    expect(calls).toBe(CATALOG_ACTIVE_CLIENTS_PER_HOUR * 2);
    expect(JSON.stringify(await blocked.json())).not.toContain("shelf-test-key");
  });

  it("caps one visitor while another visitor can still search", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };
    const cookie = await issuedCookie();
    expect(cookie).toContain("w2w=");
    for (let i = 0; i < CATALOG_CLIENT_MINUTE_LIMIT; i += 1) {
      const ok = await GET(search(`own${i}`, cookie));
      expect(ok.status).toBe(200);
    }
    const blocked = await GET(search("own-over", cookie));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("set-cookie")).toBeNull();
    expect(calls).toBe(CATALOG_CLIENT_MINUTE_LIMIT);

    const other = await issuedCookie();
    const allowed = await GET(search("other-ok", other));
    expect(allowed.status).toBe(200);
    expect(calls).toBe(CATALOG_CLIENT_MINUTE_LIMIT + 1);
  });

  it("does not spend TMDB when the visitor has no signed cookie", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };
    for (let i = 0; i < 30; i += 1) {
      const blocked = await GET(
        new Request(`https://app.example/api/catalog?op=search&q=anon${i}`, {
          headers: {
            cookie: `w2w=${i.toString(16).padStart(16, "0")}.${"ab".repeat(16)}`,
            "x-forwarded-for": `198.51.100.${i}`,
          },
        }),
      );
      expect(blocked.status).toBe(429);
      if (i === 0) {
        expect(blocked.headers.get("set-cookie")).toContain("HttpOnly");
        expect(blocked.headers.get("set-cookie")).not.toContain("shelf-test-key");
      }
    }
    expect(calls).toBe(0);
    const allowed = await GET(search("after-anon", await issuedCookie()));
    expect(allowed.status).toBe(200);
    expect(calls).toBe(1);
  });

  it("filters a search to one original language", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return Response.json({
        results: [
          { id: 1, media_type: "movie", title: "English Film", original_language: "en", poster_path: "/en.jpg" },
          { id: 2, media_type: "movie", title: "Hindi Film", original_language: "hi", poster_path: "/hi.jpg" },
        ],
      });
    };
    const response = await GET(new Request("https://app.example/api/catalog?op=search&q=film&lang=hi", { headers: { cookie: await issuedCookie() } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(body.payload.results.map((item: { title?: string }) => item.title)).toEqual(["Hindi Film"]);
    expect(JSON.stringify(body)).not.toContain("shelf-test-key");
  });

  it("keeps titles TMDB lists in the chosen language and skips the original", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      const url = String(input);
      if (url.includes("/movie/7/translations")) {
        return Response.json({ translations: [{ iso_639_1: "hi", english_name: "Hindi" }, { iso_639_1: "fr" }] });
      }
      if (url.includes("/translations")) return Response.json({ translations: [{ iso_639_1: "de" }] });
      return Response.json({
        results: [
          { id: 2, media_type: "movie", title: "Hindi Film", original_language: "hi", poster_path: "/hi.jpg" },
          { id: 7, media_type: "movie", title: "Dubbed Film", original_language: "en", poster_path: "/en.jpg" },
          { id: 8, media_type: "movie", title: "French Only", original_language: "fr", poster_path: "/fr.jpg" },
        ],
      });
    };
    const response = await GET(
      new Request("https://app.example/api/catalog?op=search&q=film&lang=hi&audio=listed", { headers: { cookie: await issuedCookie() } }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.payload.results.map((item: { title?: string; listed_in?: string[] }) => [item.title, item.listed_in])).toEqual([["Dubbed Film", ["hi", "fr"]]]);
    expect(calls.some((call) => call.includes("/movie/7/translations"))).toBe(true);
    expect(calls.some((call) => call.includes("/movie/2/translations"))).toBe(false);
    expect(JSON.stringify(body)).not.toContain("shelf-test-key");
  });

  it("loads popular titles in one original language", async () => {
    env().TMDB_API_KEY = "shelf-test-key";
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      const url = String(input);
      if (url.includes("/discover/movie")) {
        return Response.json({ results: [{ id: 2, title: "Hindi Film", original_language: "hi", poster_path: "/hi.jpg" }] });
      }
      return Response.json({ results: [{ id: 9, name: "Hindi Series", original_language: "hi", poster_path: "/series.jpg" }] });
    };
    const response = await GET(new Request("https://app.example/api/catalog?op=language&lang=hi", { headers: { cookie: await issuedCookie() } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.includes("with_original_language=hi") && call.includes("api_key=shelf-test-key"))).toBe(true);
    expect(body.payload.results.map((item: { id: number }) => item.id)).toEqual([2, 9]);
    const again = await GET(new Request("https://app.example/api/catalog?op=language&lang=hi"));
    expect(again.status).toBe(200);
    expect(calls).toHaveLength(2);
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
    const response = await GET(new Request("https://app.example/api/catalog?op=browse", { headers: { cookie: await issuedCookie() } }));
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
    const cookie = await issuedCookie();
    const first = await GET(search("spirited", cookie));
    const firstBody = await first.json();
    const second = await GET(new Request("https://app.example/api/catalog?op=search&q=spirited"));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstBody);
    const third = await GET(new Request("https://app.example/api/catalog?op=search&q=SPIRITED%20"));
    expect(third.status).toBe(200);
    expect(await third.json()).toEqual(firstBody);
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
