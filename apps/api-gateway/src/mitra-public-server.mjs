import { pathToFileURL } from "node:url";

import { createApp, startServer } from "./server.mjs";
import { createMitraPublicResearchFacade } from "./mitra-public-research.mjs";

const MITRA_PUBLIC_PATHS = Object.freeze(new Set([
  "/v1/mitra/public/health",
  "/v1/mitra/public/search",
]));

export function createMitraPublicGatewayApp({
  gatewayApp = createApp(),
  publicResearch = createMitraPublicResearchFacade(),
} = {}) {
  if (typeof gatewayApp?.handleRequest !== "function") {
    throw new TypeError("gatewayApp.handleRequest must be a function");
  }
  if (typeof publicResearch?.handleRequest !== "function") {
    throw new TypeError("publicResearch.handleRequest must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const requestUrl = new URL(String(request.url ?? "/"), "http://api-gateway.local");
      if (MITRA_PUBLIC_PATHS.has(requestUrl.pathname)) {
        const result = await publicResearch.handleRequest(request);
        if (result) return result;
      }

      return gatewayApp.handleRequest(request);
    },
  });
}

export async function startMitraPublicGatewayServer({
  app = createMitraPublicGatewayApp(),
  port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "127.0.0.1",
  maxBodyBytes,
} = {}) {
  return startServer({ app, port, host, maxBodyBytes });
}

async function main() {
  const server = await startMitraPublicGatewayServer();
  const address = server.address();

  console.log(
    JSON.stringify({
      event: "mitra_public_gateway_started",
      host: address.address,
      port: address.port,
      publicResearchConfigured: Boolean(
        String(process.env.MITRA_PUBLIC_RESEARCH_UPSTREAM_BASE_URL ?? "").trim(),
      ),
    }),
  );

  const shutdown = (signal) => {
    server.close(() => {
      console.log(JSON.stringify({ event: "mitra_public_gateway_stopped", signal }));
      process.exit(0);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        event: "mitra_public_gateway_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
