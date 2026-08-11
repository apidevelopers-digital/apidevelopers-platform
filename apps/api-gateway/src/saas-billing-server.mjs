import http from "node:http";

import { createSaasBillingHttp } from "./saas-billing-http.mjs";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
});

function jsonResponse(status, payload) {
  return {
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

export async function readBillingRawBody(
  request,
  { maxBytes = 262_144 } = {},
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      const error = new Error("request body too large");
      error.code = "REQUEST_BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}

export function createBillingReadyApp({
  baseApp,
  authenticator,
  saasBilling,
} = {}) {
  if (!baseApp || typeof baseApp.handleRequest !== "function") {
    throw new TypeError("baseApp.handleRequest must be a function");
  }
  const billingHttp = createSaasBillingHttp({ authenticator, saasBilling });

  return Object.freeze({
    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
      rawBody,
    } = {}) {
      const requestUrl = new URL(String(url), "http://api-gateway.local");
      const billing = await billingHttp.handle({
        method,
        pathname: requestUrl.pathname,
        headers,
        rawBody,
      });
      if (billing) return jsonResponse(billing.status, billing.payload);
      return baseApp.handleRequest({ method, url, headers });
    },
  });
}

export function createBillingHttpServer({ app } = {}) {
  if (!app || typeof app.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(
        String(request.url ?? "/"),
        "http://api-gateway.local",
      );
      const billingPost =
        String(request.method).toUpperCase() === "POST" &&
        requestUrl.pathname.startsWith("/v1/saas/billing/");
      const rawBody = billingPost
        ? await readBillingRawBody(request)
        : undefined;
      const result = await app.handleRequest({
        method: request.method,
        url: request.url,
        headers: request.headers,
        rawBody,
      });
      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      if (error?.code === "REQUEST_BODY_TOO_LARGE") {
        response.writeHead(413, JSON_HEADERS);
        response.end(JSON.stringify({ error: "request_body_too_large" }));
        return;
      }
      response.writeHead(500, JSON_HEADERS);
      response.end(JSON.stringify({ error: "internal_error" }));
    }
  });
}

export async function startBillingHttpServer({
  port = 0,
  host = "127.0.0.1",
  app,
} = {}) {
  const server = createBillingHttpServer({ app });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}
