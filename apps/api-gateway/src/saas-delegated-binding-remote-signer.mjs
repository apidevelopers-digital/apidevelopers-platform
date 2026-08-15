import { randomUUID } from "node:crypto";

import {
  ZUNI_DELEGATED_BINDING_ALGORITHM,
  ZUNI_DELEGATED_BINDING_AUDIENCE,
  ZUNI_DELEGATED_BINDING_VERSION,
} from "./saas-delegated-binding-proof.mjs";

export const ZUNI_REMOTE_SIGNER_VERSION = "zuni-remote-signer/v1";

function requiredText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function requiredPositiveInteger(value, name, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < min || normalized > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}`);
  }
  return normalized;
}

function assertFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}

function normalizeBinding(binding = {}) {
  return Object.freeze({
    tenantId: requiredText(binding.tenantId, "tenantId"),
    workspaceId: requiredText(binding.workspaceId, "workspaceId"),
    accessGrantId: requiredText(binding.accessGrantId, "accessGrantId"),
    productId: requiredText(binding.productId, "productId"),
    principalId: requiredText(binding.principalId, "principalId"),
  });
}

function normalizeResponse(response, expected) {
  if (!response || typeof response !== "object") {
    throw new Error("remote_signer_invalid_response");
  }

  const version = requiredText(response.version, "response.version");
  const algorithm = requiredText(response.algorithm, "response.algorithm");
  const keyId = requiredText(response.keyId, "response.keyId");
  const proof = requiredText(response.proof, "response.proof");
  const expiresAt = requiredText(response.expiresAt, "response.expiresAt");

  if (version !== ZUNI_DELEGATED_BINDING_VERSION) {
    throw new Error("remote_signer_version_mismatch");
  }
  if (algorithm !== ZUNI_DELEGATED_BINDING_ALGORITHM) {
    throw new Error("remote_signer_algorithm_mismatch");
  }
  if (keyId !== expected.keyId) {
    throw new Error("remote_signer_key_mismatch");
  }

  const proofParts = proof.split(".");
  if (proofParts.length !== 2 || proofParts.some((part) => !part)) {
    throw new Error("remote_signer_invalid_proof");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(proofParts[0], "base64url").toString("utf8"));
  } catch {
    throw new Error("remote_signer_invalid_payload");
  }

  const expectedPayload = expected.payload;
  for (const field of [
    "version",
    "audience",
    "tenantId",
    "workspaceId",
    "accessGrantId",
    "productId",
    "principalId",
    "issuedAt",
    "expiresAt",
    "nonce",
  ]) {
    if (payload?.[field] !== expectedPayload[field]) {
      throw new Error(`remote_signer_payload_mismatch:${field}`);
    }
  }

  if (expiresAt !== expectedPayload.expiresAt) {
    throw new Error("remote_signer_expiry_mismatch");
  }

  return Object.freeze({
    version,
    algorithm,
    keyId,
    proof,
    expiresAt,
  });
}

export function createZuniRemoteBindingSigner({
  keyId,
  transport,
  clock = () => new Date(),
  ttlSeconds = 60,
  nonceFactory = randomUUID,
  timeoutMs = 2500,
} = {}) {
  const normalizedKeyId = requiredText(keyId, "keyId");
  if (!transport || typeof transport !== "object") {
    throw new TypeError("transport is required");
  }
  assertFunction(transport.sign, "transport.sign");
  assertFunction(clock, "clock");
  assertFunction(nonceFactory, "nonceFactory");

  const ttl = requiredPositiveInteger(ttlSeconds, "ttlSeconds", { min: 15, max: 300 });
  const timeout = requiredPositiveInteger(timeoutMs, "timeoutMs", { min: 100, max: 10000 });

  async function signBinding(binding = {}) {
    const normalizedBinding = normalizeBinding(binding);
    const now = new Date(clock());
    if (Number.isNaN(now.getTime())) throw new Error("remote_signer_invalid_clock");

    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
    const nonce = requiredText(nonceFactory(), "nonce");

    const payload = Object.freeze({
      version: ZUNI_DELEGATED_BINDING_VERSION,
      audience: ZUNI_DELEGATED_BINDING_AUDIENCE,
      ...normalizedBinding,
      issuedAt,
      expiresAt,
      nonce,
    });

    const request = Object.freeze({
      version: ZUNI_REMOTE_SIGNER_VERSION,
      operation: "sign-zuni-delegated-binding",
      keyId: normalizedKeyId,
      algorithm: ZUNI_DELEGATED_BINDING_ALGORITHM,
      audience: ZUNI_DELEGATED_BINDING_AUDIENCE,
      payload,
      timeoutMs: timeout,
    });

    let response;
    try {
      response = await transport.sign(request);
    } catch (error) {
      const safe = new Error("remote_signer_unavailable");
      safe.cause = error;
      throw safe;
    }

    return normalizeResponse(response, {
      keyId: normalizedKeyId,
      payload,
    });
  }

  return Object.freeze({
    mode: "remote",
    version: ZUNI_REMOTE_SIGNER_VERSION,
    algorithm: ZUNI_DELEGATED_BINDING_ALGORITHM,
    keyId: normalizedKeyId,
    audience: ZUNI_DELEGATED_BINDING_AUDIENCE,
    signBinding,
  });
}
