const HIGH_RISK = new Set(["health", "legal"]);

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value;
}

export function validateDomainProfile(input) {
  const p = requireObject(input, "profile");
  requireText(p.profileId, "profile.profileId");
  requireText(p.productId, "profile.productId");
  requireText(p.domain, "profile.domain");
  requireText(p.status, "profile.status");
  requireText(p.riskClass, "profile.riskClass");
  requireObject(p.memory, "profile.memory");
  requireText(p.memory.isolation, "profile.memory.isolation");
  requireObject(p.sourcePolicy, "profile.sourcePolicy");
  requireObject(p.humanReview, "profile.humanReview");
  requireObject(p.training, "profile.training");
  requireObject(p.activation, "profile.activation");

  if (p.training.userDataAllowed !== false) {
    throw new Error("user data training must be disabled by default");
  }
  if (p.activation.failClosed !== true) {
    throw new Error("domain profile activation must be fail-closed");
  }
  if (HIGH_RISK.has(p.domain)) {
    if (p.humanReview.required !== true) throw new Error(`${p.domain} profile requires human review`);
    if (p.riskClass !== "high") throw new Error(`${p.domain} profile must be high risk`);
    if (!Array.isArray(p.prohibitedRoles) || p.prohibitedRoles.length === 0) {
      throw new Error(`${p.domain} profile must declare prohibited roles`);
    }
  }
  return true;
}

export function assertActivatable(profile) {
  validateDomainProfile(profile);
  if (profile.status !== "active") throw new Error("profile is not active");
  if (profile.activation.approved !== true) throw new Error("profile activation is not explicitly approved");
  if (!Array.isArray(profile.evaluations) || profile.evaluations.length === 0) {
    throw new Error("profile has no evaluation suite");
  }
  return true;
}

export function createDomainProfileRegistry(profiles = []) {
  const byId = new Map();
  for (const profile of profiles) {
    validateDomainProfile(profile);
    if (byId.has(profile.profileId)) throw new Error(`duplicate profileId: ${profile.profileId}`);
    byId.set(profile.profileId, Object.freeze(structuredClone(profile)));
  }
  return Object.freeze({
    get(profileId) { return byId.get(profileId) ?? null; },
    list() { return [...byId.values()]; },
  });
}
