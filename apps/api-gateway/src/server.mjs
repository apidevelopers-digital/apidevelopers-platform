import http from "node:http";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.mjs";
import { createClientStore } from "./client-store.mjs";

const MAX_BODY_BYTES = 1024 * 1024;

function loadInitialClients(value) {
  if (!value) return [];

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new TypeError("API_GATEWAY_CLIENTS_JSON must be a JSON array");
  }
  return parsed;
}

async function readBody(request) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("request body exceeds 1 MiB");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export function createHttpServer({ app } = {}) {
  const resolvedApp = app ?? createApp({
    clientStore: createClientStore({
      initialClients: loadInitialClients(process.env.API_GATEWAY_CLIENTS_JSON),
    }),
    adminKey: process.env.API_GATEWAY_ADMIN_KEY,
  });

  return http.createServer(async (request, response) => {
    try {
      const body = ["POST", "PUT", "PATCH"].includes(request.method)
        ? await readBody(request)
        : undefined;

      const result = await resolvedApp.handleRequest({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
        requestId: request.headers["x-request-id"],
      });

      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      const status = error.statusCode ?? 500;
      response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({
        error: status === 413 ? "payload_too_large" : "internal_error",
        message: status === 413 ? error.message : "Unexpected gateway error.",
      }));
    }
  });
}

export async function startServer({
  port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "127.0.0.1",
  app,
} = {}) {
  const server = createHttpServer({ app });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  return server;
}

async function main() {
  const server = await startServer();
  const address = server.address();
  console.log(JSON.stringify({
    event: "api_gateway_started",
    host: address.address,
    port: address.port,
  }));

  const shutdown = (signal) => {
    server.close(() => {
      console.log(JSON.stringify({ event: "api_gateway_stopped", signal }));
      process.exit(0);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({
      event: "api_gateway_failed",
      message: error.message,
    }));
    process.exitCode = 1;
  });
}
