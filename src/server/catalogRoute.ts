/**
 * Allowlisted TMDB proxy. The browser calls this route. The key stays in
 * `TMDB_API_KEY` on the server and is never written into a response.
 */

const TMDB_ORIGIN = "https://api.themoviedb.org";
const LIMIT = 40;
const WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; reset: number }>();

export function resetCatalogLimits(): void {
  buckets.clear();
}

type Env = { TMDB_API_KEY?: string };

function readKey(): string {
  const env = (globalThis as { process?: { env?: Env } }).process?.env;
  return env?.TMDB_API_KEY?.trim() ?? "";
}

export function allowedTmdbPath(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  const op = url.searchParams.get("op");
  if (op === "status") return "";
  if (op === "search") {
    const query = cleanQuery(url.searchParams.get("q"));
    if (!query) return null;
    return `/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US`;
  }
  if (op !== "title" && op !== "similar") return null;
  const media = url.searchParams.get("media");
  const id = url.searchParams.get("id");
  if ((media !== "movie" && media !== "tv") || !id || !/^\d{1,10}$/.test(id)) return null;
  if (op === "title") return `/3/${media}/${id}?append_to_response=credits&language=en-US`;
  return `/3/${media}/${id}/recommendations?language=en-US`;
}

export async function GET(request: Request): Promise<Response> {
  const key = readKey();
  if (!key) return respond({ configured: false }, 200);

  const path = allowedTmdbPath(request.url);
  if (path === null) return respond({ configured: true, error: "query" }, 400);
  if (path === "") return respond({ configured: true }, 200);
  if (tooMany(request)) return respond({ configured: true, error: "rate" }, 429);

  const target = new URL(`${TMDB_ORIGIN}${path}`);
  const headers: Record<string, string> = { accept: "application/json" };
  if (key.startsWith("ey")) headers.authorization = `Bearer ${key}`;
  else target.searchParams.set("api_key", key);

  try {
    const upstream = await fetch(target, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) return respond({ configured: true, error: "upstream" }, upstream.status === 401 ? 401 : 502);
    const payload: unknown = await upstream.json();
    return respond({ configured: true, payload }, 200, true);
  } catch {
    return respond({ configured: true, error: "upstream" }, 502);
  }
}

function tooMany(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-for") ?? "local";
  const ip = forwarded.split(",")[0]?.trim().slice(0, 80) || "local";
  const now = Date.now();
  if (buckets.size > 500) buckets.clear();
  const slot = buckets.get(ip);
  if (!slot || now >= slot.reset) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  slot.count += 1;
  return slot.count > LIMIT;
}

function cleanQuery(value: string | null): string {
  if (!value) return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 80);
}

function respond(body: unknown, status: number, cache = false): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": cache ? "public, max-age=300" : "no-store" },
  });
}
