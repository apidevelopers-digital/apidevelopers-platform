import { randomUUID } from "node:crypto";

import { authorize } from "@apidevelopers/auth-core";
import {
  TRUST_PRODUCT_ID,
  TRUST_SANDBOX_ENVIRONMENT,
  TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT,
  TRUST_SANDBOX_VERIFICATION_MODALITIES,
  TRUST_SANDBOX_VERIFICATION_READ_CONTRACT,
} from "@apidevelopers/contracts";
import { createDurableRepository } from "@apidevelopers/persistence-core";

const ALLOWED_FIELDS = new Set(TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT.acceptedFields);
const MODALITIES = new Set(TRUST_SANDBOX_VERIFICATION_MODALITIES);
const SUBJECT_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const reply = (status, payload) =>
  Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    }),
    body: JSON.stringify(payload),
  });

function bodyOf(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) throw new TypeError("body_required");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("body_invalid");
  }
  return parsed;
}

function normalizeCreateInput(value) {
  const input = bodyOf(value);
  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new TypeError(`unsupported_field:${key}`);
    }
  }

  const subjectRef = String(input.subjectRef ?? "").trim();
  if (!SUBJECT_REF.test(subjectRef)) {
    throw new TypeError("subjectRef_invalid");
  }

  const modality = String(input.modality ?? "").trim().toLowerCase();
  if (!MODALITIES.has(modality)) {
    throw new TypeError("modality_invalid");
  }

  return Object.freeze({ subjectRef, modality });
}

function tenantIdOf(actor) {
  const tenantId = String(actor?.principal?.tenantId ?? "").trim();
  return tenantId || null;
}

function readVerificationId(pathname) {
  if (!pathname.startsWith(TRUST_SANDBOX_VERIFICATION_READ_CONTRACT.pathPrefix)) {
    return null;
  }
  const raw = pathname.slice(TRUST_SANDBOX_VERIFICATION_READ_CONTRACT.pathPrefix.length);
  if (!raw || raw.includes("/")) return null;
  try {
    const id = decodeURIComponent(raw).trim();
    return id || null;
  } catch {
    return null;
  }
}

function authorized(actor, requiredScope) {
  const decision = authorize(actor, { scopes: [requiredScope] });
  return decision.allowed ? decision : null;
}

export function createTrustSandboxVerificationApp({
  authenticator,
  store,
  clock = () => new Date().toISOString(),
  idFactory = randomUUID,
} = {}) {
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate_function_required");
  }
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store_read_transaction_required");
  }
  if (typeof clock !== "function") throw new TypeError("clock_function_required");
  if (typeof idFactory !== "function") throw new TypeError("idFactory_function_required");

  const repository = createDurableRepository({
    store,
    collection: "trust_verifications",
    idField: "verificationId",
  });

  async function authenticate(headers) {
    const actor = await authenticator.authenticate(headers ?? {});
    if (!actor) return { error: reply(401, { ok: false, reason: "unauthorized" }) };
    const tenantId = tenantIdOf(actor);
    if (!tenantId) {
      return {
        error: reply(403, {
          ok: false,
          reason: "tenant_context_required",
        }),
      };
    }
    return { actor, tenantId };
  }

  async function handleCreate(request) {
    const authn = await authenticate(request.headers);
    if (authn.error) return authn.error;
    if (!authorized(authn.actor, TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT.requiredScope)) {
      return reply(403, {
        ok: false,
        reason: "verification_create_scope_forbidden",
      });
    }

    try {
      const input = normalizeCreateInput(request.body);
      const now = clock();
      const verificationId = `trust-verification-${idFactory()}`;
      const record = Object.freeze({
        verificationId,
        tenantId: authn.tenantId,
        productId: TRUST_PRODUCT_ID,
        environment: TRUST_SANDBOX_ENVIRONMENT,
        mode: "mock",
        status: "accepted",
        subjectRef: input.subjectRef,
        modality: input.modality,
        adapter: "none",
        biometricProcessing: false,
        result: null,
        createdAt: now,
        updatedAt: now,
      });

      const created = await repository.create(record);
      return reply(201, {
        ok: true,
        verification: created,
      });
    } catch (error) {
      const message = String(error?.message ?? "");
      const invalid =
        error instanceof SyntaxError ||
        error instanceof TypeError ||
        /required|invalid|unsupported_field/i.test(message);
      return reply(invalid ? 400 : 409, {
        ok: false,
        reason: invalid
          ? "invalid_trust_sandbox_verification_request"
          : "trust_sandbox_verification_create_failed",
      });
    }
  }

  async function handleRead(request, verificationId) {
    const authn = await authenticate(request.headers);
    if (authn.error) return authn.error;
    if (!authorized(authn.actor, TRUST_SANDBOX_VERIFICATION_READ_CONTRACT.requiredScope)) {
      return reply(403, {
        ok: false,
        reason: "verification_read_scope_forbidden",
      });
    }

    const record = await repository.getById(verificationId);
    if (!record || record.tenantId !== authn.tenantId) {
      return reply(404, {
        ok: false,
        reason: "verification_not_found",
      });
    }

    return reply(200, {
      ok: true,
      verification: record,
    });
  }

  return Object.freeze({
    repository,
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const pathname = new URL(String(request.url ?? "/"), "http://gateway.local").pathname;

      if (
        method === TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT.method &&
        pathname === TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT.path
      ) {
        return handleCreate(request);
      }

      const verificationId = readVerificationId(pathname);
      if (
        method === TRUST_SANDBOX_VERIFICATION_READ_CONTRACT.method &&
        verificationId
      ) {
        return handleRead(request, verificationId);
      }

      return null;
    },
  });
}
