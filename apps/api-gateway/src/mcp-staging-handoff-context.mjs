// Staging-only verification of an institutionally redeemed browser-session handoff.
// Deliberately not wired to the API gateway or any production OAuth endpoint.
export const MCP_STAGING_HANDOFF_CONTEXT_V1 = "mcp-staging-handoff-context/v1";
export const MCP_STAGING_HANDOFF_TARGET_ORIGIN = "https://mcp-staging.apidevelopers.digital";

export class McpStagingHandoffError extends Error {
  constructor(code) {
    super(code);
    this.name = "McpStagingHandoffError";
    this.code = code;
  }
}

function reject(code) {
  throw new McpStagingHandoffError(code);
}

function nonEmpty(value) {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function exactScopes(values) {
  if (!Array.isArray(values) || values.length === 0) reject("scopes_required");
  const normalized = new Set();
  for (const scope of values) {
    if (!nonEmpty(scope) || !/^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(scope)) {
      reject("scopes_invalid");
    }
    if (normalized.has(scope)) reject("duplicate_scopes");
    normalized.add(scope);
  }
  return Object.freeze([...normalized].sort());
}

function verifiedTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) {
    reject("authentication_time_invalid");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    reject("authentication_time_invalid");
  }
  return parsed;
}

function requireShape(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject(code);
  return value;
}

/**
 * Accepts only a trusted server-side redemption and authoritative session evidence.
 * Does not expose an HTTP route, create a grant, wire a server, or activate production.
 *
 * `redeemHandoff` MUST authenticate the server-to-server caller and enforce atomic
 * single-use PKCE S256 redemption. `resolveSessionEvidence` MUST verify that the
 * evidence is bound to the redeemed handoff, and check current session revocation.
 */
export function createMcpStagingHandoffContext({
  enabled = false,
  targetOrigin = MCP_STAGING_HANDOFF_TARGET_ORIGIN,
  expectedTenantId,
  audience = "mcp-plugin-gateway",
  expectedRedeemerId,
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
      enabled: false,
      mode: "staging-only",
      productionEnabled: false,
      async verify() { reject("mcp_staging_handoff_disabled"); },
    });
  }

  // Exact pinned origin; no arbitrary target or production origin can be provided.
  if (targetOrigin !== MCP_STAGING_HANDOFF_TARGET_ORIGIN) reject("staging_target_not_allowed");
  if (!nonEmpty(expectedTenantId) || !nonEmpty(audience) ||
      !nonEmpty(expectedRedeemerId)) reject("identity_binding_required");
  if (typeof redeemHandoff !== "function" ||
      typeof resolveSessionEvidence !== "function") reject("trusted_backends_required");
  if (typeof now !== "function") reject("clock_required");
  if (!Number.isSafeInteger(maxAuthenticationAgeSeconds) ||
      maxAuthenticationAgeSeconds < 30 || maxAuthenticationAgeSeconds > 900 ||
      !Number.isSafeInteger(maxHandoffAgeSeconds) ||
      maxHandoffAgeSeconds < 30 || maxHandoffAgeSeconds > 300) {
    reject("freshness_policy_invalid");
  }
  const clientScopes = new Set(exactScopes(clientAllowedScopes));
  const tenantScopes = new Set(exactScopes(tenantAllowedScopes));

  return Object.freeze({
    enabled: true,
    mode: "staging-only",
    productionEnabled: false,
    targetOrigin,
    async verify({ code, codeVerifier, requestedScopes } = {}) {
      const requested = exactScopes(requestedScopes);
      if (!nonEmpty(code) || !nonEmpty(codeVerifier)) reject("handoff_binding_required");

      let redeemed;
      try {
        redeemed = await redeemHandoff({ code, codeVerifier, targetOrigin });
      } catch {
        // Never expose provider errors or raw codes.
        reject("handoff_redemption_failed");
      }
      const handoff = requireShape(redeemed, "handoff_proof_invalid");
      const principal = requireShape(handoff.principal, "handoff_principal_invalid");
      const source = requireShape(handoff.source, "handoff_source_invalid");
      if (handoff.authenticated !== true ||
          source.authenticationMethod !== "browser_session_handoff" ||
          source.browserBindingMethod !== "S256" ||
          source.targetOrigin !== targetOrigin ||
          !nonEmpty(source.redemptionProofId) ||
          source.redeemerId !== expectedRedeemerId ||
          principal.status !== "active" ||
          !nonEmpty(principal.id) ||
          principal.tenantId !== expectedTenantId) {
        reject("handoff_identity_invalid");
      }
      const principalScopes = new Set(exactScopes(principal.scopes));
      const current = now();
      if (!(current instanceof Date) || Number.isNaN(current.getTime())) reject("clock_invalid");
      const issuedAt = verifiedTime(source.issuedAt);
      const nowMs = current.getTime();
      if (issuedAt > nowMs || nowMs - issuedAt > maxHandoffAgeSeconds * 1000) {
        reject("handoff_expired");
      }

      // Bound evidence must come from trusted server storage, never browser headers.
      let evidence;
      try {
        evidence = await resolveSessionEvidence({
          principalId: principal.id,
          tenantId: principal.tenantId,
          handoffIssuedAt: source.issuedAt,
          redemptionProofId: source.redemptionProofId,
        });
      } catch {
        reject("session_evidence_unavailable");
      }
      const session = requireShape(evidence, "session_evidence_missing");
      if (session.active !== true ||
          session.revoked === true ||
          session.principalId !== principal.id ||
          session.tenantId !== principal.tenantId ||
          session.handoffIssuedAt !== source.issuedAt ||
          session.redemptionProofId !== source.redemptionProofId ||
          !nonEmpty(session.subject) ||
          session.policyDecision !== "allow" ||
          !nonEmpty(session.policyDecisionId)) {
        reject("session_evidence_invalid");
      }
      const originalAuthentication = verifiedTime(session.authenticatedAt);
      const sessionExpiresAt = verifiedTime(session.sessionExpiresAt);
      if (sessionExpiresAt <= nowMs || originalAuthentication > issuedAt ||
          originalAuthentication > nowMs ||
          nowMs - originalAuthentication > maxAuthenticaticationAgeSeconds * 1000) {
        reject("authentication_stale");
      }
      const userScopes = new Set(exactScopes(session.userScopes));
      const policyScopes = new Set(exactScopes(session.policyAllowedScopes));

      for (const scope of requested) {
        if (!clientScopes.has(scope) ||
            !tenantScopes.has(scope) ||
            !principalScopes.has(scope) ||
             !userScopes.has(scope) ||
            !policyScopes.has(scope)) {
            reject("scope_not_authorized");
        }
      }

      return Object.freeze({
        version: MCP_STAGING_HANDOFF_CONTEXT_V1,
        mode: "staging-only",
        productionEnabled: false,
        authorizationSubject: Object.freeze({
          subject: session.subject,
          tenant_id: expectedTenantId,
          audience,
          auth_time: Math.floor(originalAuthentication / 1000),
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
