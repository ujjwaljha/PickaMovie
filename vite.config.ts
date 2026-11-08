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
            const response = await mod.GET(request);
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

export default defineConfig({
  plugins: [react(), tailwindcss(), catalogDevApi()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
