function normalizeText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new TypeError("scopes must be a non-empty array");
  }

  const normalized = [...new Set(scopes.map((scope) => normalizeText(scope, "scope")))];
  normalized.sort();
  return normalized;
}

function assertAllowedScopes(scopes, allowedScopes) {
  for (const scope of scopes) {
    if (!allowedScopes.has(scope)) {
      throw new Error(`scope_not_allowed:${scope}`);
    }
  }
}

function redactPlan({ tenantId, name, scopes, requestedBy, reason, mode }) {
  return Object.freeze({
    service: "gateway-key-provisioner",
    mode,
    tenantId,
    name,
    scopes: Object.freeze([...scopes]),
    requestedBy,
    reason,
    secretReturned: false,
    requiresApproval: mode !== "dry-run",
  });
}

export function createGatewayKeyProvisioner({
  lifecycleService,
  allowedScopes = ["ada:mitra:read"],
  approvalPhrase = "IGOR_APROVA_GATEWAY_KEY_PROVISIONER_REAL",
} = {}) {
  if (!lifecycleService || typeof lifecycleService.issueApiKey !== "function") {
    throw new TypeError("lifecycleService.issueApiKey must be a function");
  }

  const allowedScopeSet = new Set(allowedScopes.map((scope) => normalizeText(scope, "allowedScope")));

  function normalizeRequest(input = {}) {
    const tenantId = normalizeText(input.tenantId, "tenantId");
    const name = normalizeText(input.name, "name");
    const scopes = normalizeScopes(input.scopes);
    const requestedBy = normalizeText(input.requestedBy ?? "operator", "requestedBy");
    const reason = normalizeText(input.reason ?? "not_specified", "reason");

    assertAllowedScopes(scopes, allowedScopeSet);

    return Object.freeze({
      tenantId,
      name,
      scopes: Object.freeze(scopes),
      requestedBy,
      reason,
    });
  }

  return Object.freeze({
    planIssue(input = {}) {
      return redactPlan({
        ...normalizeRequest(input),
        mode: "dry-run",
      });
    },

    async issue(input = {}) {
      const request = normalizeRequest(input);
      const confirmation = normalizeText(input.confirmation, "confirmation");

      if (confirmation !== approvalPhrase) {
        throw new Error("approval_phrase_mismatch");
      }

      const result = await lifecycleService.issueApiKey({
        tenantId: request.tenantId,
        name: request.name,
        scopes: [...request.scopes],
      });

      return Object.freeze({
        service: "gateway-key-provisioner",
        mode: "real",
        tenantId: request.tenantId,
        name: request.name,
        scopes: Object.freeze([...request.scopes]),
        apiKeyId: result.apiKey?.id,
        prefix: result.apiKey?.prefix,
        status: result.apiKey?.status,
        createdAt: result.apiKey?.createdAt,
        secret: result.secret,
        events: Object.freeze(result.events ?? []),
        requestedBy: request.requestedBy,
        reason: request.reason,
        secretReturned: true,
        secretHandling: "return-once-to-operator-store-immediately",
      });
    },
  });
}
