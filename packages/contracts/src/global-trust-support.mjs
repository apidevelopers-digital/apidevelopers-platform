export const VERSION = "1.0.0";
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{2,127}$/i;
const BCP47 = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
export const SUBJECT_TYPES = new Set(["person", "organization", "service", "machine", "agent"]);
export const SUBJECT_STATUSES = new Set(["active", "suspended", "retired"]);
export const ASSURANCE_LEVELS = new Set(["aal1", "aal2", "aal3"]);
export const DECISION_EFFECTS = new Set(["allow", "deny", "pending_approval"]);
export const CREDENTIAL_TYPES = new Set(["passkey", "mfa", "api_key", "service_credential", "federated", "session"]);
export const CREDENTIAL_STATUSES = new Set(["active", "suspended", "revoked", "expired"]);
export const RISK_LEVELS = new Set(["low", "moderate", "high", "critical"]);
export const MODEL_STATUSES = new Set(["candidate", "approved", "suspended", "retired"]);
export const AUDIT_OUTCOMES = new Set(["success", "failure", "denied", "pending_approval"]);
export const EVIDENCE_KINDS = new Set(["contract", "test", "decision", "execution", "incident", "observation"]);
export const DIRECTIONS = new Set(["ltr", "rtl"]);

export function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

export function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

export function string(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function optionalString(value, name) {
  if (value == null) return null;
  return string(value, name);
}

export function id(value, name) {
  const normalized = string(value, name);
  if (!SAFE_ID.test(normalized) || normalized.includes("@")) {
    throw new Error(`${name} must be an opaque safe identifier`);
  }
  return normalized;
}

export function iso(value, name) {
  const normalized = string(value, name);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(`${name} must be an ISO date`);
  return normalized;
}

export function enumeration(value, name, allowed) {
  const normalized = string(value, name);
  if (!allowed.has(normalized)) throw new Error(`${name} is invalid`);
  return normalized;
}

export function bool(value, name) {
  if (typeof value !== "boolean") throw new TypeError(`${name} must be a boolean`);
  return value;
}

export function numberInRange(value, name, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${name} must be a number between ${min} and ${max}`);
  }
  return value;
}

export function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

export function strings(value, name, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  const normalized = [...new Set(value.map((item, index) => string(item, `${name}[${index}]`)))].sort();
  if (!allowEmpty && normalized.length === 0) throw new Error(`${name} must not be empty`);
  return normalized;
}

export function plainMetadata(value, name) {
  if (value == null) return {};
  object(value, name);
  const cloned = clone(value);
  const serialized = JSON.stringify(cloned);
  if (serialized.length > 8192) throw new Error(`${name} exceeds 8192 bytes`);
  const forbidden = /(password|secret|private[_-]?key|access[_-]?token|refresh[_-]?token)/i;
  for (const key of Object.keys(cloned)) {
    if (forbidden.test(key)) throw new Error(`${name} contains a forbidden sensitive key`);
  }
  return cloned;
}

export function header(type) {
  return { schemaVersion: VERSION, contractType: type };
}

export function assertHeader(value, type, name) {
  object(value, name);
  if (value.schemaVersion !== VERSION) throw new Error(`${name}.schemaVersion must be ${VERSION}`);
  if (value.contractType !== type) throw new Error(`${name}.contractType must be ${type}`);
}

export function finalize(value, assertion) {
  assertion(value);
  return freeze(clone(value));
}

