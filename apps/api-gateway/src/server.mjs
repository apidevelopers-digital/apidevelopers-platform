import http from "node:http";
import { pathToFileURL } from "node:url";

export function createApp() {
  return {
    async handleRequest({ method = "GET", url = "/" } = {}) {
      const normalizedMethod = String(method).toUpperCase();

      if (normalizedMethod === "GET" && url === "/health") {
        return {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            service: "api-gateway",
            status: "ok",
          }),
        };
      }

      return {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          error: "not_found",
        }),
      };
    },
  };
}

export function createHttpServer({ app = createApp() } = {}) {
  return http.createServer(async (request, response) => {
    try {
      const result = await app.handleRequest({
        method: request.method,
        url: request.url,
        headers: request.headers,
      });

      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      response.writeHead(500, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(
        JSON.stringify({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
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

  const shutdown = (signal) => {
    server.close(() => {
      console.log(JSON.stringify({ event: "api_gateway_stopped", signal }));
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
        event: "api_gateway_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
