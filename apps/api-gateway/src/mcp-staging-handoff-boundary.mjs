/**
 * Standalone, non-wired staging-only handoff boundary for MCP OAuth research.
 *
 * Reuses the institution's browser-session-handoff/v1 service via createService.
 * It does NOT authorize OAuth grants, mount any HTTP route, or enable production.
 * The caller MUST inject the real session authenticator, authenticated server
 * redeemer and atomic store; client-supplied identity headers do not suffice.
 */

export const MCP_STAGING_READ_SCOPE = "mcp:tools:read";
const STAGING_HOST = /^mcp-staging(?:-[a-z0-9]+)?\.apidevelopers\.digital$/;

export class McpStagingHandoffError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.name = "McpStagingHandoffError";
    this.code = code;
    this.status = status;
  }
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function stagingOrigin(value) {
  const raw = requireText(value, "approvedTargetOrigin");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError("approvedTargetOrigin must be an HTTPS staging origin");
  }

  if (
    parsed.protocol !== "https:" ||
    !STAGING_HOST.test(parsed.hostname) ||
    parsed.username || parsed.password ||
    parsed.pathname !== "/" || parsed.search || parsed.hash ||
    parsed.port !== "" ||
    parsed.origin !== raw.replace(/\/$/, "")
  ) {
    throw new TypeError("approvedTargetOrigin must be an exact MCP staging HTTPS origin");
  }
  return parsed.origin;
}

function verifiedClient(authentication, tenantId) {
  if (authentication?.role !== "client") return null;
  const principal = authentication.principal;
  if (
    !principal ||
    principal.status !== "active" ||
    typeof principal.id !== "string" ||
    !principal.id.trim() ||
    principal.tenantId !== tenantId ||
    !Array.isArray(principal.scopes) ||
    !principal.scopes.includes(MCP_STAGING_READ_SCOPE)
  ) {
    return null;
  }

  // Only the minimal staging read scope crosses this boundary.
  return Object.freeze({
    role: "client",
    principal: Object.freeze({
      id: principal.id.trim(),
      tenantId,
      status: "active",
      scopes: Object.freeze([MCP_STAGING_READ_SCOPE]),
      authenticationMethod: "browser_session",
    }),
  });
}

async function isExpectedRedeemer(authenticator, headers, expectedId) {
  const result = await authenticator.authenticate(headers);
  return result?.role === "server" &&
    typeof result.principal?.id === "string" &&
    result.principal.id === expectedId;
}

function assertRedeemed(redeemed, tenantId, origin) {
  if (
    redeemed?.version !== "browser-session-handoff/v1" ||
    redeemed?.authenticated !== true ||
    redeemed.principal?.status !== "active" ||
    typeof redeemed.principal?.id !== "string" ||
    !redeemed.principal.id.trim() ||
    redeemed.principal.tenantId !== tenantId ||
    redeemed.principal.authenticationMethod !== "browser_session_handoff" ||
    !Array.isArray(redeemed.principal.scopes) ||
    redeemed.principal.scopes.length !== 1 ||
    redeemed.principal.scopes[0] !== MCP_STAGING_READ_SCOPE ||
    redeemed.source?.targetOrigin !== origin ||
    redeemed.source.browserBindingMethod !== "S256"
  ) {
    throw new McpStagingHandoffError("staging_handoff_identity_invalid");
  }
}

export function createMcpStagingHandoffBoundary({
  enabled = false,
  approvedTargetOrigin,
  expectedTenantId,
  expectedRedeemerId,
  sourceAuthenticator,
  redeemerAuthenticator,
  store,
  createService,
  ttlSeconds = 60,
} = {}) {
  // Do not even construct or expose a handoff service unless explicitly
  // enabled by a separate, reviewed staging-only composition.
  if (enabled !== true) {
    return Object.freeze({
      enabled: false,
      descriptor: Object.freeze({
        mode: "mcp-staging-lab",
        productionEnabled: false,
        oauthGrantsEnabled: false,
        runtimeAutoWiring: false,
      }),
    });
  }

  const origin = stagingOrigin(approvedTargetOrigin);
  const tenantId = requireText(expectedTenantId, "expectedTenantId");
  const redeemerId = requireText(expectedRedeemerId, "expectedRedeemerId");

  if (typeof sourceAuthenticator?.authenticate !== "function" ||
      typeof redeemerAuthenticator?.authenticate !== "function" ||
      typeof store?.putIfAbsent !== "function" ||
      typeof store?.take !== "function" ||
      typeof createService !== "function") {
    throw new TypeError("staging handoff requires source/server authenticators, atomic store and service factory");
  }

  const gatedSourceAuthenticator = Object.freeze({
    async authenticate(headers) {
      // Authentication failures must not fall back to environment or headers.
      const authentication = await sourceAuthenticator.authenticate(headers);
      return verifiedClient(authentication, tenantId);
    },
  });

  const service = createService({
    sourceAuthenticator: gatedSourceAuthenticator,
    store,
    allowedTargetOrigins: [origin],
    ttlSeconds,
  });

  if (
    typeof service?.issue !== "function" ||
    typeof service?.redeem !== "function" ||
    service.descriptor?.oneTimeRedemptionRequired !== true ||
    service.descriptor?.browserBindingRequired !== true ||
    service.descriptor?.browserBindingMethod !== "S256"
  ) {
    throw new TypeError("staging handoff requires a one-time S256-bound service");
  }

  return Object.freeze({
    enabled: true,
    descriptor: Object.freeze({
      mode: "mcp-staging-lab",
      targetOrigin: origin,
      tenantId,
      allowedScope: MCP_STAGING_READ_SCOPE,
      productionEnabled: false,
      oauthGrantsEnabled: false,
      originalAuthenticationTimeVerified: false,
      runtimeAutoWiring: false,
      browserBindingMethod: "S256",
      oneTimeRedemptionRequired: true,
      exactServerRedeemerRequired: true,
    }),

    async issue({ sourceHeaders, targetOrigin, codeChallenge } = {}) {
      if (targetOrigin !== origin) {
        throw new McpStagingHandoffError("staging_target_mismatch");
      }
      return service.issue({
        headers: sourceHeaders ?? {},
        targetOrigin: origin,
        codeChallenge,
      });
    },

    async redeem({ serverHeaders, code, codeVerifier } = {}) {
      // Trusted server authentication precedes the destructive atomic take.
      let authorized;
      try {
        authorized = await isExpectedRedeemer(
          redeemerAuthenticator, serverHeaders ?? {}, redeemerId,
        );
      } catch {
        throw new McpStagingHandoffError("staging_server_auth_unavailable", 503);
      }
      if (!authorized) {
        throw new McpStagingHandoffError("staging_redeemer_unauthorized", 401);
      }

      const redeemed = await service.redeem({
        code,
        targetOrigin: origin,
        codeVerifier,
      });
      assertRedeemed(redeemed, tenantId, origin);

      // The current handoff contract omits the ORIGINAL human auth_time and
      // source authentication provenance. Never synthesize those claims.
      return Object.freeze({
        authenticated: true,
        principal: Object.freeze({
          id: redeemed.principal.id,
          tenantId,
          scopes: Object.freeze([MCP_STAGING_READ_SCOPE]),
        }),
        source: Object.freeze({
          targetOrigin: origin,
          authenticationMethod: "browser_session_handoff",
          browserBindingMethod: "S256",
        }),
        oauthGrantsEnabled: false,
        originalAuthenticationTimeVerified: false,
      });
    },
  });
}
