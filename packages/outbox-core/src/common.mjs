export class OutboxDomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OutboxDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

export function requireText(value, name) {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new OutboxDomainError("invalid_argument", `${name} is required`);
  }
  return result;
}

export function requirePositiveSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new OutboxDomainError(
      "invalid_argument",
      `${name} must be a positive safe integer`,
    );
  }
  return value;
}

export function requireIso(value, name) {
  const result = requireText(value, name);
  if (Number.isNaN(Date.parse(result))) {
    throw new OutboxDomainError("invalid_argument", `${name} must be an ISO date`);
  }
  return result;
}

export function deepFreeze(value) {
  const copy = structuredClone(value);
  (function freeze(node) {
    if (node && typeof node === "object" && !Object.isFrozen(node)) {
      Object.values(node).forEach(freeze);
      Object.freeze(node);
    }
  })(copy);
  return copy;
}
