import { createServer } from "node:http";

import {
  ZUNI_DELEGATED_BINDING_ALGORITHM,
  ZUNI_DELEGATED_BINDING_AUDIENCE,
  ZUNI_DELEGATED_BINDING_VERSION,
} from "./saas-delegated-binding-proof.mjs";
import { ZUNI_REMOTE_SIGNER_VERSION } from "./saas-delegated-binding-remote-signer.mjs";

const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_MAX_TTL_SECONDS = 300;
const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 30;

function requiredText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function parseIso(value, name) {
  const raw = requiredText(value, name);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be an ISO timestamp`);
  return date;
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

function canonicalPayload(payload = {}) {
  return {
    version: requiredText(payload.version, "payload.version"),
    audience: requiredText(payload.audience, "payload.audience"),
    tenantId: requiredText(payload.tenantId, "payload.tenantId"),
    workspaceId: requiredText(payload.workspaceId, "payload.workspaceId"),
    accessGrantId: requiredText(payload.accessGrantId, "payload.accessGrantId"),
    productId: requiredText(payload.productId, "payload.productId"),
    principalId: requiredText(payload.principalId, "payload.principalId"),
    issuedAt: requiredText(payload.issuedAt, "payload.issuedAt"),
    expiresAt: requiredText(payload.expiresAt, "payload.expiresAt"),
    nonce: requiredText(payload.nonce, "payload.nonce"),
  };
}

export function createZuniRemoteSignerService({
  keyId,
  signPayload,
  clock = () => new Date(),
  nonceStore = new Set(),
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  maxTtlSeconds = DEFAULT_MAX_TTL_SECONDS,
  maxClockSkewSeconds = DEFAULT_MAX_CLOCK_SKEW_SECONDS,
} = {}) {
  const normalizedKeyId = requiredText(keyId, "keyId");
  if (typeof signPayload !== "function") throw new TypeError("signPayload must be a function");
  if (typeof clock !== "function") throw new TypeError("clock must be a function");
  if (!nonceStore || typeof nonceStore.has !== "function" || typeof nonceStore.add !== "function") {
    throw new TypeError("nonceStore must expose has/add");
  }

  async function sign(request = {}) {
    if (request.version !== ZUNI_REMOTE_SIGNER_VERSION) throw new Error("remote_signer_version_mismatch");
    if (request.operation !== "sign-zuni-delegated-binding") throw new Error("remote_signer_operation_denied");
    if (request.algorithm !== ZUNI_DELEGATED_BINDING_ALGORITHM) throw new Error("remote_signer_algorithm_denied");
    if (request.audience !== ZUNI_DELEGATED_BINDING_AUDIENCE) throw new Error("remote_signer_audience_denied");
    if (requiredText(request.keyId, "keyId") !== normalizedKeyId) throw new Error("remote_signer_key_denied");

    const payload = canonicalPayload(request.payload);
    if (payload.version !== ZUNI_DELEGATED_BINDING_VERSION) throw new Error("remote_signer_payload_version_denied");
    if (payload.audience !== ZUNI_DELEGATED_BINDING_AUDIENCE) throw new Error("remote_signer_payload_audience_denied");

    const now = new Date(clock());
    if (Number.isNaN(now.getTime())) throw new Error("remote_signer_invalid_clock");
    const issuedAt = parseIso(payload.issuedAt, "payload.issuedAt");
    const expiresAt = parseIso(payload.expiresAt, "payload.expiresAt");
    const ttlMs = expiresAt.getTime() - issuedAt.getTime();
    if (ttlMs < 1 || ttlMs > maxTtlSeconds * 1000) throw new Error("remote_signer_ttl_denied");
    if (issuedAt.getTime() > now.getTime() + maxClockSkewSeconds * 1000) throw new Error("remote_signer_issued_at_future");
    if (expiresAt.getTime() < now.getTime() - maxClockSkewSeconds * 1000) throw new Error("remote_signer_expired");
    if (nonceStore.has(payload.nonce)) throw new Error("remote_signer_replay_detected");

    const payloadJson = JSON.stringify(payload);
    const payloadB64u = Buffer.from(payloadJson).toString("base64url");
    const signature = requiredText(
      await signPayload(Object.freeze({
        algorithm: ZUNI_DELEGATED_BINDING_ALGORITHM,
        keyId: normalizedKeyId,
        payloadB64u,
      })),
      "signature",
    );

    nonceStore.add(payload.nonce);

    return Object.freeze({
      version: ZUNI_DELEGATED_BINDING_VERSION,
      algorithm: ZUNI_DELEGATED_BINDING_ALGORITHM,
      keyId: normalizedKeyId,
      proof: `${payloadB64u}.${signature}`,
      expiresAt: payload.expiresAt,
    });
  }

  return Object.freeze({
    descriptor: Object.freeze({
      version: ZUNI_REMOTE_SIGNER_VERSION,
      keyId: normalizedKeyId,
      audience: ZUNI_DELEGATED_BINDING_AUDIENCE,
      algorithm: ZUNI_DELEGATED_BINDING_ALGORITHM,
    }),
    sign,
    maxBodyBytes,
  });
}

export async function startZuniRemoteSignerDaemon({
  service,
  host = "127.0.0.1",
  port = 0,
  serverFactory = createServer,
} = {}) {
  if (!service || typeof service.sign !== "function") throw new TypeError("service.sign must be a function");

  const server = serverFactory(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/healthz") {
        return jsonResponse(res, 200, { ok: true, service: "zuni-remote-signer", version: ZUNI_REMOTE_SIGNER_VERSION });
      }
      if (req.method !== "POST" || req.url !== "/v1/sign") {
        return jsonResponse(res, 404, { ok: false, error: "not_found" });
      }
      const request = await readJson(req, service.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
      const response = await service.sign(request);
      return jsonResponse(res, 200, response);
    } catch (error) {
      return jsonResponse(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "remote_signer_failed",
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  return Object.freeze({
    server,
    address: server.address(),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  });
}
