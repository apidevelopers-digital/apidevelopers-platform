import { pathToFileURL } from "node:url";

import {
  createApp as createBaseApp,
  createHttpServer as createBaseHttpServer,
} from "./server.mjs";
import {
  bridgeErrorResponse,
  createInstagramSchedulerBackendBridge,
  toBridgeJsonResponse,
} from "./instagram-scheduler-backend-bridge.mjs";
import { createChatgptPluginGatewayBridge } from "./chatgpt-plugin-gateway.mjs";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
});

function jsonResult({ status, payload }) {
  return {
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

export function createInstagramSchedulerBridgeApp({
  baseApp = createBaseApp(),
  instagramSchedulerBridge = createInstagramSchedulerBackendBridge(),
  chatgptPluginGatewayBridge = createChatgptPluginGatewayBridge(),
} = {}) {
  if (!baseApp || typeof baseApp.handleRequest !== "function") {
    throw new TypeError("baseApp.handleRequest must be a function");
  }
  if (
    instagramSchedulerBridge !== undefined &&
    typeof instagramSchedulerBridge?.handleRequest !== "function"
  ) {
    throw new TypeError("instagramSchedulerBridge.handleRequest must be a function");
  }
  if (
    chatgptPluginGatewayBridge !== undefined &&
    typeof chatgptPluginGatewayBridge?.handleRequest !== "function"
  ) {
    throw new TypeError("chatgptPluginGatewayBridge.handleRequest must be a function");
  }

  return Object.freeze({
    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
      body,
    } = {}) {
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;

      if (
        chatgptPluginGatewayBridge &&
        pathname.startsWith("/v1/plugins/")
      ) {
        const result = await chatgptPluginGatewayBridge.handleRequest({
          method,
          pathname,
          headers,
          body,
        });
        if (result) return result;
      }

      if (
        instagramSchedulerBridge &&
        pathname.startsWith("/v1/internal/instagram-scheduler/")
      ) {
        try {
          const result = await instagramSchedulerBridge.handleRequest({
            method,
            pathname,
            headers,
            body,
          });
          if (result) return jsonResult(toBridgeJsonResponse(result));
        } catch (error) {
          return jsonResult(bridgeErrorResponse(error));
        }
      }

      return baseApp.handleRequest({ method, url, headers, body });
    },
  });
}

export function createHttpServer({
  app = createInstagramSchedulerBridgeApp(),
  maxBodyBytes,
} = {}) {
  return createBaseHttpServer({ app, maxBodyBytes });
}

export async function startServer({
  port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "127.0.0.1",
  app,
  maxBodyBytes,
} = {}) {
  const server = createHttpServer({
    app: app ?? createInstagramSchedulerBridgeApp(),
    maxBodyBytes,
  });

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
    instagramSchedulerBridge: true,
    chatgptPluginGatewayBridge: true,
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(JSON.stringify({
      event: "api_gateway_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    process.exitCode = 1;
  });
}
