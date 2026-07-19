import { listPublicApis } from "./catalog.mjs";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
});

function response(status, body) {
  return {
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export async function handleRequest({ method = "GET", url = "/" } = {}) {
  const pathname = new URL(url, "http://localhost").pathname;

  if (method !== "GET") {
    return response(405, {
      error: "method_not_allowed",
      message: "Only GET is supported in the MVP.",
    });
  }

  if (pathname === "/health" || pathname === "/v1/health") {
    return response(200, {
      status: "ok",
      service: "api-gateway",
      version: "0.1.0",
    });
  }

  if (pathname === "/v1") {
    return response(200, {
      name: "API Developers Platform",
      version: "v1",
      links: {
        catalog: "/v1/apis",
        openapi: "/openapi.json",
        health: "/health",
      },
    });
  }

  if (pathname === "/v1/apis") {
    return response(200, {
      data: listPublicApis(),
      meta: { count: listPublicApis().length },
    });
  }

  return response(404, {
    error: "not_found",
    message: "Route not found.",
  });
}
