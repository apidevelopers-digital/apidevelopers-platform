import { createHash } from "node:crypto";

import { createDurableRepository } from "../../persistence-core/src/index.mjs";

const PROVIDER_PATTERN = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/;

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function normalizeProvider(value) {
  const provider = requireText(value, "provider").toLowerCase();
  if (!PROVIDER_PATTERN.test(provider)) throw new TypeError("provider is invalid");
  return provider;
}

function normalizeSubject(value) {
  return requireText(value, "externalSubject").toLowerCase();
}

function digestIdentity(tenantId, provider, externalSubject) {
  return createHash("sha256")
    .update(`${tenantId}\0${provider}\0${externalSubject}`, "utf8")
    .digest("hex");
}

export function createFederatedPrincipalRuntime({ store, clock = () => new Date().toISOString() } = {}) {
  if (!store) throw new TypeError("store is required");

  const principals = createDurableRepository({
    store,
    collection: "saas.federatedPrincipals",
    idField: "federatedPrincipalId",
  });

  async function resolveFederatedPrincipal({
    tenantId,
    provider,
    externalSubject,
    subjectType = "external_identity",
  } = {}) {
    const normalizedTenantId = requireText(tenantId, "tenantId");
    const normalizedProvider = normalizeProvider(provider);
    const normalizedSubject = normalizeSubject(externalSubject);
    const identityHash = digestIdentity(
      normalizedTenantId,
      normalizedProvider,
      normalizedSubject,
    );
    const federatedPrincipalId = `component.federated-principal.${identityHash}`;
    const current = await principals.getById(federatedPrincipalId);
    if (current) return current;

    const principal = Object.freeze({
      federatedPrincipalId,
      principalId: `component.principal.${identityHash.slice(0, 32)}`,
      tenantId: normalizedTenantId,
      provider: normalizedProvider,
      externalSubjectHash: identityHash,
      subjectType: requireText(subjectType, "subjectType"),
      status: "active",
      createdAt: clock(),
    });

    return principals.create(principal);
  }

  return Object.freeze({
    resolveFederatedPrincipal,
    getFederatedPrincipal: (federatedPrincipalId) =>
      principals.getById(federatedPrincipalId),
  });
}
