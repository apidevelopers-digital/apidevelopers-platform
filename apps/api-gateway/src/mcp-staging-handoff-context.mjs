// Staging-only contract; not mounted in any HTTP runtime.
export const MCP_STAGING_HANDOFF_CONTEXT_V1 = "mcp-staging-handoff-context/v1";
export const MCP_STAGING_HANDOFF_TARGET_ORIGIN = "https://mcp-staging.apidevelopers.digital";

export class McpStagingHandoffError extends Error {
  constructor(code) {
    super(code);
    this.name = "McpStagingHandoffError";
    this.code = code;
  }
}

const reject = (code) => { throw new McpStagingHandoffError(code); };
const text = (v) => typeof v === "string" && v.trim() === v && v.length > 0;
const shape = (v, code) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) reject(code);
  return v;
};
const scopes = (values) => {
  if (!Array.isArray(values) || !values.length) reject("scopes_required");
  const seen = new Set();
  for (const value of values) {
    if (!text(value) || !/^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(value)) reject("scopes_invalid");
    if (seen.has(value)) reject("duplicate_scopes");
    seen.add(value);
  }
  return Object.freeze([...seen].sort());
};
const timeMs = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)) {
    reject("authentication_time_invalid");
  }
  const ms = Date.parse(v);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== v) reject("authentication_time_invalid");
  return ms;
};

/**
 * Trusted callbacks MUST enforce server authentication, one-time PKCE redemption,
 * current session status, revocation, and evidence bound to a unique proof ID.
 * No HTTP endpoints, grants, or production activation are created here.
 */
export function createMcpStagingHandoffContext({
  enabled = false,
  targetOrigin = MCP_STAGING_HANDOFF_TARGET_ORIGIN,
  expectedTenantId,
  expectedRedeemerId,
  audience = "mcp-plugin-gateway",
  clientAllowedScopes,
  tenantAllowedScopes,
  redeemHandoff,
  resolveSessionEvidence,
  now = () => new Date(),
  maxAuthenticationAgeSeconds = 900,
  maxHandoffAgeSeconds = 90,
} = {}) {
  if (enabled !== true) {
    return Object.freeze({
      enabled: false, mode: "staging-only", productionEnabled: false,
      async verify() { reject("mcp_staging_handoff_disabled"); },
    });
  }
  if (targetOrigin !== MCP_STAGING_HANDOFF_TARGET_ORIGIN) reject("staging_target_not_allowed");
  if (!text(expectedTenantId) || !text(expectedRedeemerId) || !text(audience)) {
    reject("identity_binding_required");
  }
  if (typeof redeemHandoff !== "function" || typeof resolveSessionEvidence !== "function") {
    reject("trusted_backends_required");
  }
  if (typeof now !== "function") reject("clock_required");
  if (!Number.isSafeInteger(maxAuthenticationAgeSeconds) ||
      maxAuthenticationAgeSeconds < 30 || maxAuthenticationAgeSeconds > 900 ||
      !Number.isSafeInteger(maxHandoffAgeSeconds) ||
      maxHandoffAgeSeconds < 30 || maxHandoffAgeSeconds > 300) reject("freshness_policy_invalid");
  const client = new Set(scopes(clientAllowedScopes));
  const tenant = new Set(scopes(tenantAllowedScopes));

  return Object.freeze({
    enabled: true, mode: "staging-only", productionEnabled: false, targetOrigin,
    async verify({ code, codeVerifier, requestedScopes } = {}) {
      const requested = scopes(requestedScopes);
      if (!text(code) || !text(codeVerifier)) reject("handoff_binding_required");
      let proof;
      try {
        proof = await redeemHandoff({ code, codeVerifier, targetOrigin });
      } catch {
        reject("handoff_redemption_failed");
      }
      const redeemed = shape(proof, "handoff_proof_invalid");
      const principal = shape(redeemed.principal, "handoff_principal_invalid");
      const source = shape(redeemed.source, "handoff_source_invalid");
      if (redeemed.authenticated !== true ||
          source.authenticationMethod !== "browser_session_handoff" ||
          source.browserBindingMethod !== "S256" ||
          source.targetOrigin !== targetOrigin ||
          !text(source.redemptionProofId) ||
          source.redeemerId !== expectedRedeemerId ||
          principal.status !== "active" ||
          !text(principal.id) || principal.tenantId !== expectedTenantId) {
        reject("handoff_identity_invalid");
      }
      const principalScopes = new Set(scopes(principal.scopes));
      const current = now();
      if (!(current instanceof Date) || Number.isNaN(current.getTime())) reject("clock_invalid");
      const currentMs = current.getTime();
      const issuedMs = timeMs(source.issuedAt);
      if (issuedMs > currentMs || currentMs - issuedMs > maxHandoffAgeSeconds * 1000) {
        reject("handoff_expired");
      }
      let data;
      try {
        data = await resolveSessionEvidence({
          principalId: principal.id, tenantId: principal.tenantId,
          handoffIssuedAt: source.issuedAt, redemptionProofId: source.redemptionProofId,
        });
      } catch {
        reject("session_evidence_unavailable");
      }
      const session = shape(data, "session_evidence_missing");
      if (session.active !== true || session.revoked === true ||
          session.principalId !== principal.id ||
          session.tenantId !== principal.tenantId ||
          session.handoffIssuedAt !== source.issuedAt ||
          session.redemptionProofId !== source.redemptionProofId ||
          !text(session.subject) || session.policyDecision !== "allow" ||
          !text(session.policyDecisionId)) reject("session_evidence_invalid");

      const authenticatedMs = timeMs(session.authenticatedAt);
      const expiryMs = timeMs(session.sessionExpiresAt);
      if (expiryMs <= currentMs || authenticatedMs > issuedMs ||
          authenticatedMs > currentMs ||
          currentMs - authenticatedMs > maxAuthenticationAgeSeconds * 1000) {
        reject("authentication_stale");
      }
      const user = new Set(scopes(session.userScopes));
    const policy = new Set(scopes(session.policyAllowedScopes));
      for (const scope of requested) {
        if (!client.has(scope) || !tenant.has(scope) || !principalScopes.has(scope) ||
            !user.has(scope) || !policy.has(scope)) reject("scope_not_authorized");
      }
      return Object.freeze({
        version: MCP_STAGING_HANDOFF_CONTEXT_V1,
        mode: "staging-only", productionEnabled: false,
        authorizationSubject: Object.freeze({
          subject: session.subject, tenant_id: expectedTenantId, audience,
          auth_time: Math.floor(authenticatedMs / 1000),
        }),
        authorizedScopes: requested,
        evidence: Object.freeze({
          policyDecisionId: session.policyDecisionId,
          authenticationMethod: "browser_session_handoff",
          handoffIssuedAt: source.issuedAt,
          redemptionProofId: source.redemptionProofId,
          originalAuthenticatedAt: session.authenticatedAt,
        }),
      });
    },
  });
}
