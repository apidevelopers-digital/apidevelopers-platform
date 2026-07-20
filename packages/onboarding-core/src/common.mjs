export class OnboardingDomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OnboardingDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

export function requireText(value, name) {
  const result = String(value ?? "").trim();
  if (!result) throw new OnboardingDomainError("invalid_argument", `${name} is required`);
  return result;
}

export function requireIso(value, name) {
  const result = requireText(value, name);
  if (Number.isNaN(Date.parse(result))) {
    throw new OnboardingDomainError("invalid_argument", `${name} must be an ISO date`);
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

const SENSITIVE_KEY = /(authorization|bearer|password|secret|token|private.?key|card|cvv|cvc|pan)/i;

function isSensitiveKey(key) {
  const normalized = String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalized === "apikeyid" || normalized === "apikeyprefix" || normalized.startsWith("apikeyissued")) {
    return false;
  }
  return normalized === "apikey" || SENSITIVE_KEY.test(key);
}

export function assertNoSensitiveData(value, path = "metadata") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      throw new OnboardingDomainError(
        "sensitive_data_forbidden",
        `${path}.${key} cannot be stored by onboarding-core`,
      );
    }
    assertNoSensitiveData(nested, `${path}.${key}`);
  }
}
