import http from "node:http";
import { pathToFileURL } from "node:url";
import {
  PlatformError,
  createRequestContext,
  toErrorResponse,
} from "@apidevelopers/platform-core";
import { createApp } from "./app.mjs";
import { createJsonlAuditLog } from "./audit-log.mjs";
import { createClientRegistry } from "./client-registry.mjs";
import { createJsonFileClientRepository } from "./client-repository.mjs";
import { createFixedWindowRateLimiter } from "./rate-limit.mjs";

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
      throw new PlatformError(
        "payload_too_large",
        "Request body exceeds 1 MiB.",
        { status: 413 },
      );
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export function createRuntimeApp(env = process.env) {
  const repository = createJsonFileClientRepository({
    filePath: env.API_GATEWAY_CLIENT_STORE_PATH ?? "./var/clients.json",
  });
  const clientRegistry = createClientRegistry({
    repository,
    initialClients: loadInitialClients(env.API_GATEWAY_CLIENTS_JSON),
    maxActiveKeys: Number(env.API_GATEWAY_MAX_ACTIVE_KEYS ?? 5),
  });
  const auditLog = createJsonlAuditLog({
    filePath: env.API_GATEWAY_AUDIT_LOG_PATH ?? "./var/audit.jsonl",
  });
  const rateLimiter = createFixedWindowRateLimiter({
    limit: Number(env.API_GATEWAY_RATE_LIMIT ?? 120),
    windowMs: Number(env.API_GATEWAY_RATE_WINDOW_MS ?? 60_000),
  });

  return createApp({
    clientRegistry,
    auditLog,
    rateLimiter,
    adminKey: env.API_GATEWAY_ADMIN_KEY,
  });
}

export function createHttpServer({ app } = {}) {
  const resolvedApp = app ?? createRuntimeApp();

  return http.createServer(async (request, response) => {
    const requestInput = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      remoteAddress: request.socket.remoteAddress,
    };
    let context;

    try {
      const body = ["POST", "PUT", "PATCH"].includes(
        String(request.method ?? "GET").toUpperCase(),
      )
        ? await readBody(request)
        : undefined;

      const result = await resolvedApp.handleRequest({
        ...requestInput,
        body,
      });
      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      context = context ?? createRequestContext(requestInput);
      const result = toErrorResponse(error, context);
      response.writeHead(result.status, result.headers);
      response.end(result.body);
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
  console.log(
    JSON.stringify({
      event: "api_gateway_started",
      host: address.address,
      port: address.port,
    }),
  );

  const shutdown = (signal) =>
    server.close(() => {
      console.log(JSON.stringify({ event: "api_gateway_stopped", signal }));
      process.exit(0);
    });

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
        event: "api_gateway_failed",
        message: error.message,
      }),
    );
    process.exitCode = 1;
  });
}
