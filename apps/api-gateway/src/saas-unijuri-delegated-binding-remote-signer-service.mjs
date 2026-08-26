import {
  UNIJURI_DELEGATED_BINDING_ALGORITHM as ALGORITHM,
  UNIJURI_DELEGATED_BINDING_AUDIENCE as AUDIENCE,
  UNIJURI_DELEGATED_BINDING_PRODUCT_ID as PRODUCT_ID,
  UNIJURI_DELEGATED_BINDING_VERSION as BINDING_VERSION,
} from "./saas-unijuri-delegated-binding-proof.mjs";
import { UNIJURI_REMOTE_SIGNER_VERSION } from "./saas-unijuri-delegated-binding-remote-signer.mjs";

function text(value, name) {
  const v = String(value ?? "").trim();
  if (!v) throw new TypeError(`${name} is required`);
  return v;
}

export function createUniJuriRemoteSignerService({
  keyId,
  signPayload,
  clock = () => new Date(),
  nonceStore = new Set(),
  maxTtlSeconds = 300,
  maxClockSkewSeconds = 30,
} = {}) {
  const id = text(keyId, "keyId");
  if (typeof signPayload !== "function") throw new TypeError("signPayload must be a function");

  return Object.freeze({
    descriptor: Object.freeze({
      version: UNIJURI_REMOTE_SIGNER_VERSION,
      keyId: id,
      audience: AUDIENCE,
      algorithm: ALGORITHM,
      productId: PRODUCT_ID,
    }),
    async sign(request = {}) {
      if (request.version !== UNIJURI_REMOTE_SIGNER_VERSION) throw new Error("remote_signer_version_mismatch");
      if (request.operation !== "sign-uni-juri-delegated-binding") throw new Error("remote_signer_operation_denied");
      if (request.algorithm !== ALGORITHM) throw new Error("remote_signer_algorithm_denied");
      if (request.audience !== AUDIENCE) throw new Error("remote_signer_audience_denied");
      if (text(request.keyId, "keyId") !== id) throw new Error("remote_signer_key_denied");

      const payload = { ...request.payload };
      if (payload.version !== BINDING_VERSION) throw new Error("remote_signer_payload_version_denied");
      if (payload.audience !== AUDIENCE) throw new Error("remote_signer_payload_audience_denied");
      if (payload.productId !== PRODUCT_ID) throw new Error("remote_signer_product_denied");
      for (const field of ["tenantId","workspaceId","accessGrantId","principalId","issuedAt","expiresAt","nonce"]) {
        payload[field] = text(payload[field], `payload.${field}`);
      }

      const now = new Date(clock()).getTime();
      const issued = Date.parse(payload.issuedAt);
      const expires = Date.parse(payload.expiresAt);
      if (!Number.isFinite(issued) || !Number.isFinite(expires)) throw new Error("remote_signer_invalid_time");
      if (expires <= issued || expires - issued > maxTtlSeconds * 1000) throw new Error("remote_signer_ttl_denied");
      if (issued > now + maxClockSkewSeconds * 1000) throw new Error("remote_signer_issued_at_future");
      if (expires < now - maxClockSkewSeconds * 1000) throw new Error("remote_signer_expired");
      if (nonceStore.has(payload.nonce)) throw new Error("remote_signer_replay_detected");

      const payloadB64u = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signature = text(await signPayload({ algorithm: ALGORITHM, keyId: id, payloadB64u }), "signature");
      nonceStore.add(payload.nonce);

      return Object.freeze({
        version: BINDING_VERSION,
        algorithm: ALGORITHM,
        keyId: id,
        proof: `${payloadB64u}.${signature}`,
        expiresAt: payload.expiresAt,
      });
    },
  });
}
