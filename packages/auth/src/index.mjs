import { createAuthContext } from "@apidevelopers/contracts";

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function isoTime(value, name) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be an ISO date`);
  }
  return Date.parse(value);
}

function defaultVerifier() {
  return false;
}

export function createAuthEngine({
  clock = () => new Date().toISOString(),
  verifyCredential = defaultVerifier,
} = {}) {
  if (typeof clock !== "function") throw new TypeError("clock must be a function");
  if (typeof verifyCredential !== "function") {
    throw new TypeError("verifyCredential must be a function");
  }

  return Object.freeze({
    async authenticate({
      authenticationId,
      principal,
      credential,
      proof,
      scopes = [],
      requestId,
      correlationId,
    } = {}) {
      object(principal, "principal");
      object(credential, "credential");

      const now = clock();
      const nowMs = isoTime(now, "clock()");
      const issuedAtMs = isoTime(credential.issuedAt, "credential.issuedAt");
      const expiresAtMs = isoTime(credential.expiresAt, "credential.expiresAt");

      if (principal.status !== "active") throw new Error("principal is not active");
      if (credential.status !== "active") throw new Error("credential is not active");
      if (credential.revokedAt != null) throw new Error("credential is revoked");
      if (issuedAtMs > nowMs) throw new Error("credential is not active yet");
      if (expiresAtMs <= nowMs) throw new Error("credential is expired");

      const verified = await verifyCredential({
        principal: structuredClone(principal),
        credential: structuredClone(credential),
        proof,
        now,
      });
      if (verified !== true) throw new Error("authentication denied");

      return createAuthContext({
        authenticationId,
        principal,
        credential,
        scopes,
        requestId,
        correlationId,
        authenticatedAt: now,
      });
    },
  });
}
