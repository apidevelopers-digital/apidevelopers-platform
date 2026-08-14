import {
  TRUST_EVALUATION_CREDENTIAL_ENVELOPE_ALGORITHM,
  TRUST_EVALUATION_CREDENTIAL_ENVELOPE_VERSION,
 } from "./global-trust-evaluation-credential-envelope.mjs";

export const TRUST_EVALUATION_ENVELOPE_TRANSPORT_POLICY_VERSION =
  "trust-evaluation-envelope-transport-policy/v1";
export const TRUST_EVALUATION_ENVELOPE_TRANSPORT_APPROVAL_ASSERTION =
  "sealed_envelope_transport_authorized";

const ALLOWED_MODES = new Set(["disabled", "sandbox", "external"]);
const ENVELOPE_KEYS = new Set([
  "version",
  "algorithm",
  "recipientKeyFingerprint",
  "context",
  "contextDigestB64u",
  "ciphertextB64u",
]);
const CONTEXT_KEYS = new Set(["tenantId", "apiKeyId", "expiresAt", "correlationId"]);

function fail(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  throw error;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    fail("TRUST_EVALUATION_ENVELOPE_TRANSPORT_INVALID_INPUT", `${name} is required`);
  }
  return normalized;
}

function requireIso(value, name) {
  const normalized = requireText(value, name);
  if (Number.isNaN(Date.parse(normalized)) {
    fail("TRUST_EVALUATION_ENVELOPE_TRANSPORT_INVALID_TIME", `${name} must be an ISO-8601 date`);
  }
  return normalized;
}

function canonicalB64u(value, name) {
  const normalized = requireText(value, name);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    fail("TRUST_EVALUATION_ENVELOPE_TRANSPORT_INVALID_ENCODING", `${name} must be base64url without padding`);
  }
  const decoded = Buffer.from(normalized, "base64url");
  if (!decoded.length || decoded.toString("base64url") !== normalized) {
    fail("TRUST_EVALUATION_ENVELOPE_TRANSPORT_INVALID_ENCODING", `${name} must be canonical base64url`);
  }
  return normalized;
}

function assertExactKeys(value, allowed, name) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(
        "TRUST_EVALUATION_ENVELOPE_TRANSPORT_FORBIDDEN_FIELD",
        ${name}.${key} is not permitted`,
      );
    }
  }
}

function normalizeEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    fail("TRUST_EVALUATION_ENVELOPE_TRANSPORT_INVALID_ENVELOPE", "envelope must be an object");
  }
  assertExactKeys(envelope, ENVELOPE_KEYS, "envelope");

  if (envelope.version !== TRUST_EVALUATION_CREDENTIAL_ENVELOPE_VERSION) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_TRANSPORT_UNSUPPORTED_VERSION",
      "credential envelope version is unsupported",
    );
  }
  if (envelope.algorithm !== TRUST_EVALUATION_CREDENTIAL_ENVELOPE_ALGORITHM) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_TRANSPORT_UNSUPPORTED_ALGORITHM",
      "credential envelope algorithm is unsupported",
    );
  }
  if (!envelope.context || typeof envelope.context !== "object" || Array.isArray(envelope.context)) {
    fail("TRUST_EVALUATION_ENVELOPE_TRANSPORT_INVALID_CONTEXT", "envelope.context is required");
  }
  assertExactKeys(envelope.context, CONTEXT_KEYS, "envelope.context");

  const context = Object.freeze({
    tenantId: requireText(envelope.context.tenantId, "envelope.context.tenantId"),
    apiKeyId: requireText(envelope.context.apiKeyId, "envelope.context.apiKeyId"),
    expiresAt: requireIso(envelope.context.expiresAt, "envelope.context.expiresAt"),
    correlationId: requireText(envelope.context.correlationId, "envelope.context.correlationId"),
  });

  return Object.freeze({
    version: envelope.version,
    algorithm: envelope.algorithm,
    recipientKeyFingerprint: canonicalB64u(
      envelope.recipientKeyFingerprint,
      "envelope.recipientKeyFingerprint",
    ),
    context,
    contextDigestB64u: canonicalB64u(envelope.contextDigestB64u, "envelope.contextDigestB64u"),
    ciphertextB64u: canonicalB64u(envelope.ciphertextB64u, "envelope.ciphertextB64u"),
  });
}

function normalizeApproval(approval, channelId, now) {
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_TRANSPORT_APPROVAL_REQUIRED",
      "institutional transport approval is required",
    );
  }
  if (requireText(approval.decision, "approval.decision") !== "approved") {
    fail("TRUST_EVALUATION_ENVELOPE_TRANSPORT_NOT_APPROVED", "transport decision must be approved");
  }
  if (
    requireText(approval.assertion, "approval.assertion") !==
    TRUST_EVALUATION_ENVELOPE_TRANSPORT_APPROVAL_ASSERTION
  ) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_TRANSPORT_INVALID_APPROVAL_ASSERTION",
      $`transport approval assertion must be ${TRUST_EVALUATION_ENVELOPE_TRANSPORT_APPROVAL_ASSERTION}`,
    );
  }
  if (requireText(approval.channelId, "approval.channelId") !== channelId) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_TRANSPORT_APPROVAL_CHANNEL_MISMATCH",
      "transport approval does not match channelId",
    );
  }
  const approvedAt = requireIso(approval.approvedAt, "approval.approvedAt");
  if (Date.parse(approvedAt) > Date.parse(now)) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_TRANSPORT_APPROVAL_IN_FUTURE",
      "transport approval cannot be dated in the future",
    );
  }
  return Object.freeze({
    decision: "approved",
    assertion: TRUST_EVALUATION_ENVELOPE_TRANSPORT_APPROVAL_ASSERTION,
    channelId,
    reference: requireText(approval.reference, "approval.reference"),
    authority: requireText(approval.authority, "approval.authority"),
    approvedBy: requireText(approval.approvedBy, "approval.approvedBy"),
    approvedAt,
  });
}

function normalizePolicy(policy = {}, now) {
  const mode = requireText(policy.mode ?? "disabled", "policy.mode");
  if (!ALLOWED_MODES.has(mode)) {
    fail("TRUST_EVALUATION_ENVELOPE_TRANSPORT_INVALID_MODE", "policy.mode is unsupported");
  }
  const enabled = policy.enabled === true;
  if (!enabled || mode === "disabled") {
    return Object.freeze({
      version: TRUST_EVALUATION_ENVELOPE_TRANSPORT_POLICY_VERSION,
      enabled: false,
      mode: "disabled",
      channelId: null,
      channelType: null,
      approval: null,
    });
  }

  const channelId = requireText(policy.channelId, "policy.channelId");
  const channelType = requireText(policy.channelType, "policy.channelType");
  const approval = mode === "external" ? normalizeApproval(policy.approval, channelId, now) : null;

  return Object.freeze({
    version: TRUST_EVALUATION_ENVELOPE_TRANSPORT_POLICY_VERSION,
    enabled: true,
    mode,
    channelId,
    channelType,
    approval,
  });
}

function requireAdapter(adapter, policy) {
  if (!adapter || typeof adapter !== "object" || typeof adapter.deliver !== "function") {
    fail(
      "TRUST_EVALUATION_ENVELOPE_TRANSPORT_INVALID_ADAPTER",
      "transport adapter with deliver() is required",
    );
  }
  const kind = requireText(adapter.kind, "adapter.kind");
  const externalEgressCapable = adapter.externalEgressCapable === true;

  if (policy.mode === "sandbox" && (kind !== "sandbox" || externalEgressCapable)) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_TRANSPORT_ADAPTER_BOUNDARY",
      "sandbox transport requires a non-egress sandbox adapter",
    );
  }
  if (policy.mode === "external" && (kind !== "external" || !externalEgressCapable)) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_TRANSPORT_ADAPTER_BOUNDARY",
      "external transport requires an external-egress-capable adapter",
    );
  }
  return adapter;
}

export function createGlobalTrustEvaluationEnvelopeTransportControl({
  policy = {},
  adapter,
  clock = () => new Date().toISOString(),
} = {}) {
  if (typeof clock !== "function") {
    fail("TRUST_EVALUATION_ENVELOPE_TRANSPORT_INVALID_CLOCK", "clock must be a function");
  }
  const now = requireIso(clock(), "clock()");
  const normalizedPolicy = normalizePolicy(policy, now);
  const normalizedAdapter = normalizedPolicy.enabled ? requireAdapter(adapter, normalizedPolicy) : null;

  return Object.freeze({
    policy: normalizedPolicy,

    async deliver({ envelope, externalExecutionApproved = false } = {}) {
      if (!normalizedPolicy.enabled || normalizedPolicy.mode === "disabled") {
        fail(
          "TRUST_EVALUATION_ENVELOPE_TRANSPORT_DISABLED",
          "sealed envelope transport is disabled",
        );
      }
      if (normalizedPolicy.mode === "external" && externalExecutionApproved !== true) {
        fail(
          "TRUST_EVALUATION_ENVELOPE_TRANSPORT_EXTERNAL_APPROVAL_REQUIRED",
          "external sealed-envelope transport requires explicit execution approval",
        );
      }

      const normalizedEnvelope = normalizeEnvelope(envelope);
      const transportedAt = requireIso(clock(), "clock()");
      let result;
      try {
        result = await normalizedAdapter.deliver(normalizedEnvelope);
      } catch (cause) {
        fail(
          "TRUST_EVALUATION_ENVELOPE_TRANSPORT_DELIVERY_FAILED",
          "sealed envelope transport adapter failed",
          cause,
        );
      }

      if (!result || result.accepted !== true) {
        fail(
          "TRUST_EVALUATION_ENVELOPE_TRANSPORT_NOT_ACCEPTED",
          "sealed envelope transport adapter did not accept delivery",
        );
      }

      return Object.freeze({
        transported: true,
        mode: normalizedPolicy.mode,
        channelId: normalizedPolicy.channelId,
        channelType: normalizedPolicy.channelType,
        transportReference: requireText(result.transportReference, "adapter result transportReference"),
        recipientKeyFingerprint: normalizedEnvelope.recipientKeyFingerprint,
        contextDigestB64u: normalizedEnvelope.contextDigestB64u,
        transportedAt,
        externalDeliveryOccurred: normalizedPolicy.mode === "external",
        ciphertextIncludedInReceipt: false,
        plaintextCredentialIncluded: false,
      });
    },
  });
}
