import { createHash } from "node:crypto";

export const PERSISTENCE_FORMAT = "apid.persistence.v1";

export class PersistenceDomainError extends Error {
  constructor(code, message, { details = {}, cause } = {}) {
    super(message, { cause });
    this.name = "PersistenceDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

export function requireText(value, name) {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new PersistenceDomainError("invalid_argument", `${name} is required`);
  }
  return result;
}

export function clone(value) {
  assertJsonValue(value);
  return structuredClone(value);
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function assertJsonValue(value, path = "$") {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new PersistenceDomainError(
        "non_json_value",
        `${path} must contain a finite number`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, nested] of Object.entries(value)) {
      assertJsonValue(nested, `${path}.${key}`);
    }
    return;
  }
  throw new PersistenceDomainError(
    "non_json_value",
    `${path} contains a value that cannot be persisted as JSON`,
  );
}

function canonicalize(value) {
  assertJsonValue(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function checksum(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function createEmptyPersistenceState() {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    collections: {},
    idempotency: {},
    outbox: [],
  };
}

export function encodePersistenceState(state) {
  const payload = clone(state);
  assertJsonValue(payload);
  return `${JSON.stringify(
    {
      format: PERSISTENCE_FORMAT,
      checksum: checksum(payload),
      payload,
    },
    null,
    2,
  )}\n`;
}

export function decodePersistenceState(text) {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch (cause) {
    throw new PersistenceDomainError(
      "persistence_corrupted",
      "persistence file is not valid JSON",
      { cause },
    );
  }

  if (envelope?.format !== PERSISTENCE_FORMAT) {
    throw new PersistenceDomainError(
      "unsupported_persistence_format",
      "persistence format is not supported",
      { details: { format: envelope?.format } },
    );
  }
  if (checksum(envelope.payload) !== envelope.checksum) {
    throw new PersistenceDomainError(
      "persistence_checksum_mismatch",
      "persistence checksum does not match payload",
    );
  }

  const state = envelope.payload;
  if (
    state?.schemaVersion !== 1 ||
    !Number.isSafeInteger(state?.revision) ||
    state.revision < 0 ||
    !state.collections ||
    typeof state.collections !== "object" ||
    !state.idempotency ||
    typeof state.idempotency !== "object" ||
    !Array.isArray(state.outbox)
  ) {
    throw new PersistenceDomainError(
      "invalid_persistence_state",
      "persistence payload is structurally invalid",
    );
  }
  return deepFreeze(clone(state));
}
