import {
  createUniJuriAccessGrantWriter,
  UNIJURI_ACCESS_WRITE_APPROVAL,
} from "./saas-unijuri-access-grant-writer.mjs";

const ROUTE = "/v1/saas/uni-juri/access/provision";

function response(status, payload, headers = {}) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    }),
    body: JSON.stringify(payload),
  });
}

function parseBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  const text = String(body ?? "").trim();
  if (!text) throw new TypeError("body_invalid");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("body_invalid");
  }
  return parsed;
}

export function resolveUniJuriAccessWriteEnabled(env = process.env) {
  return String(env?.API_GATEWAY_UNIJURI_ACCESS_WRITE_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}

export function createUniJuriAccessHttpApp({
  authenticator,
  runtime,
  audit = async () => {},
  writeEnabled = false,
} = {}) {
  const writer = createUniJuriAccessGrantWriter({
    authenticator,
    runtime,
    audit,
    writeEnabled: writeEnabled === true,
  });

  return Object.freeze({
    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
      body = "",
    } = {}) {
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;
      if (pathname !== ROUTE) return null;

      if (String(method).toUpperCase() !== "POST") {
        return response(405, {
          ok: false,
          reason: "method_not_allowed",
          writesExecuted: false,
        }, { allow: "POST" });
      }

      let payload;
      try {
        payload = parseBody(body);
      } catch {
        return response(400, {
          ok: false,
          reason: "invalid_json_body",
          writesExecuted: false,
        });
      }

      const result = await writer.provision({
        headers,
        approval: payload.approval,
        binding: payload.binding ?? {},
      });
      return response(result.status, result);
    },
  });
}

export {
  ROUTE as UNIJURI_ACCESS_PROVISION_ROUTE,
  UNIJURI_ACCESS_WRITE_APPROVAL,
};
