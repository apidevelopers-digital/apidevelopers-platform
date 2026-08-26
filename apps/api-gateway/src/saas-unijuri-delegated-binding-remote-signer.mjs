import { randomUUID } from "node:crypto";
import {
  UNIJURI_DELEGATED_BINDING_ALGORITHM as ALGORITHM,
  UNIJURI_DELEGATED_BINDING_AUDIENCE as AUDIENCE,
  UNIJURI_DELEGATED_BINDING_PRODUCT_ID as PRODUCT_ID,
  UNIJURI_DELEGATED_BINDING_VERSION as BINDING_VERSION,
} from "./saas-unijuri-delegated-binding-proof.mjs";

export const UNIJURI_REMOTE_SIGNER_VERSION = "uni-juri-remote-signer/v1";

function text(value, name) {
  const v = String(value ?? "").trim();
  if (!v) throw new TypeError(`${name} is required`);
  return v;
}

export function createUniJuriRemoteBindingSigner({
  keyId,
  transport,
  clock = () => new Date(),
  ttlSeconds = 60,
  nonceFactory = randomUUID,
  timeoutMs = 2500,
} = {}) {
  const id = text(keyId, "keyId");
  if (typeof transport?.sign !== "function") throw new TypeError("transport.sign must be a function");
  if (!Number.isSafeInteger(Number(ttlSeconds)) || Number(ttlSeconds) < 15 || Number(ttlSeconds) > 300) {
    throw new TypeError("ttlSeconds must be an integer between 15 and 300");
  }

  return Object.freeze({
    mode: "remote",
    version: UNIJURI_REMOTE_SIGNER_VERSION,
    algorithm: ALGORITHM,
    audience: AUDIENCE,
    productId: PRODUCT_ID,
    keyId: id,
    async signBinding(binding = {}) {
      if (text(binding.productId, "productId") !== PRODUCT_ID) return null;
      const now = new Date(clock());
      if (Number.isNaN(now.getTime())) throw new Error("remote_signer_invalid_clock");

      const payload = Object.freeze({
        version: BINDING_VERSION,
        audience: AUDIENCE,
        tenantId: text(binding.tenantId, "tenantId"),
        workspaceId: text(binding.workspaceId, "workspaceId"),
        accessGrantId: text(binding.accessGrantId, "accessGrantId"),
        productId: PRODUCT_ID,
        principalId: text(binding.principalId, "principalId"),
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + Number(ttlSeconds) * 1000).toISOString(),
        nonce: text(nonceFactory(), "nonce"),
      });

      let response;
      try {
        response = await transport.sign(Object.freeze({
          version: UNIJURI_REMOTE_SIGNER_VERSION,
          operation: "sign-uni-juri-delegated-binding",
          keyId: id,
          algorithm: ALGORITHM,
          audience: AUDIENCE,
          payload,
          timeoutMs,
        }));
      } catch (cause) {
        const error = new Error("remote_signer_unavailable");
        error.cause = cause;
        throw error;
      }

      if (response?.version !== BINDING_VERSION) throw new Error("remote_signer_version_mismatch");
      if (response?.algorithm !== ALGORITHM) throw new Error("remote_signer_algorithm_mismatch");
      if (response?.keyId !== id) throw new Error("remote_signer_key_mismatch");
      const proof = text(response?.proof, "response.proof");
      const parts = proof.split(".");
      if (parts.length !== 2 || parts.some((part) => !part)) throw new Error("remote_signer_invalid_proof");

      let signedPayload;
      try {
        signedPayload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      } catch {
        throw new Error("remote_signer_invalid_payload");
      }
      for (const field of Object.keys(payload)) {
        if (signedPayload?.[field] !== payload[field]) throw new Error(`remote_signer_payload_mismatch:${field}`);
      }

      return Object.freeze({
        version: BINDING_VERSION,
        algorithm: ALGORITHM,
        keyId: id,
        proof,
        expiresAt: payload.expiresAt,
      });
    },
  });
}
