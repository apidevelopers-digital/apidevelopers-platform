import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { UNIJURI_REMOTE_SIGNER_VERSION } from "./saas-unijuri-delegated-binding-remote-signer.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_MAX_BODY_BYTES = 32 * 1024;
const SIGN_PATH = "/v1/unijuri/delegated-binding/sign";

function requiredText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function jsonResponse(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.length),
    "cache-control": "no-store",
  });
  res.end(body);
}

async function readJson(req, maxBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("remote_signer_request_too_large");
    chunks.push(chunk);
  }
  if (size < 1) throw new Error("remote_signer_empty_request");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("remote_signer_invalid_json");
  }
}

function extractBearer(req) {
  const raw = String(req.headers?.authorization ?? "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match ? match[1].trim() : "";
}

function authorizedToken(actual, expected) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createUniJuriRemoteSignerHttpHandler({
  service,
  bearerTokenProvider,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
} = {}) {
  if (!service || typeof service.sign !== "function") throw new TypeError("service.sign must be a function");
  if (typeof bearerTokenProvider !== "function") throw new TypeError("bearerTokenProvider must be a function");

  return async function handler(req, res) {
    try {
      if (req.method === "GET" && req.url === "/healthz") {
        return jsonResponse(res, 200, {
          ok: true,
          service: "uni-juri-remote-signer",
          version: UNIJURI_REMOTE_SIGNER_VERSION,
        });
      }

      if (req.method !== "POST" || req.url !== SIGN_PATH) {
        return jsonResponse(res, 404, { ok: false, error: "not_found" });
      }

      const actual = extractBearer(req);
      if (!actual) {
        return jsonResponse(res, 401, { ok: false, error: "remote_signer_unauthorized" });
      }

      const expected = requiredText(await bearerTokenProvider({
        purpose: "uni-juri.delegated-binding.remote-signer",
      }), "bearerToken");

      if (!authorizedToken(actual, expected)) {
        return jsonResponse(res, 403, { ok: false, error: "remote_signer_forbidden" });
      }

      const request = await readJson(req, maxBodyBytes);
      const response = await service.sign(request);
      return jsonResponse(res, 200, response);
    } catch (error) {
      return jsonResponse(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "remote_signer_failed",
      });
    }
  };
}

export async function startUniJuriRemoteSignerDaemon({
  service,
  bearerTokenProvider,
  host = DEFAULT_HOST,
  port = 0,
  serverFactory = createServer,
} = {}) {
  if (host !== DEFAULT_HOST) {
    throw new Error("remote_signer_external_bind_not_authorized");
  }

  const handler = createUniJuriRemoteSignerHttpHandler({ service, bearerTokenProvider });
  const server = serverFactory(handler);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  return Object.freeze({
    server,
    address: server.address(),
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  });
}

export const UNIJURI_REMOTE_SIGNER_DAEMON_CONTRACT = Object.freeze({
  bindHost: DEFAULT_HOST,
  signPath: SIGN_PATH,
  auth: "bearer-required",
  externalBind: "denied",
});
