import { randomBytes } from "node:crypto";
import { hashBrowserSessionSecret, serializeBrowserSessionCookie } from "@apidevelopers/auth-core/browser-session-authenticator";
import { createWebAgentShadowCommercialContextId, webAgentShadowPersistenceCollections as C } from "./web-agent-shadow-persistence-providers.mjs";
import {
  createUniCoPreviewAuthenticationEvidence,
  uniCoPreviewAuthenticationEvidenceCollection,
} from "./web-agent-preview-authentication-evidence.mjs";

export const uniCoPreviewLoginHost = "uni-preview.apidevelopers.digital";
export const uniCoPreviewProductId = "product:uni-co";
export const uniCoPreviewAgentId = "uni.co";
export const mitraPreviewLoginHost = "mitra-preview.apidevelopers.digital";
export const mitraPrimaryLoginHost = "mitra.apidevelopers.digital";
export const mitraPreviewProductId = "product:mitra";
export const mitraPreviewAgentId = "mitra.professional";

const req = (v, n) => {
  v = String(v ?? "").trim();
  if (!v) throw new TypeError(`${n} is required`);
  return v;
};

function normalizeSurface(surface = {}) {
  return Object.freeze({
    host: req(surface.host, "surface.host").toLowerCase(),
    productId: req(surface.productId, "surface.productId"),
    agentId: req(surface.agentId, "surface.agentId"),
  });
}

function normalizeSurfaces(surfaces) {
  const source = Array.isArray(surfaces) && surfaces.length
    ? surfaces
    : [{ host: uniCoPreviewLoginHost, productId: uniCoPreviewProductId, agentId: uniCoPreviewAgentId }];
  const byHost = new Map();
  for (const surface of source) {
    const normalized = normalizeSurface(surface);
    byHost.set(normalized.host, normalized);
  }
  return byHost;
}

function selectSurface(surfacesByHost, { host, productId } = {}) {
  const surfaceHost = String(host ?? "").trim().toLowerCase();
  const surface = surfacesByHost.get(surfaceHost);
  if (!surface) {
    const error = new Error("preview_login_surface_not_allowed");
    error.status = 403;
    throw error;
  }

  const requestedProductId = String(productId ?? "").trim();
  if (requestedProductId && requestedProductId !== surface.productId) {
    const error = new Error("preview_login_product_mismatch");
    error.status = 403;
    throw error;
  }

  return surface;
}

export function createUniCoPreviewBrowserSessionBootstrap({
  store,
  verifyCredentials,
  resolveAccess,
  loginSurfaces,
  clock = () => new Date(),
  generateSecret = () => randomBytes(32).toString("base64url"),
  sessionTtlSeconds = 1800,
} = {}) {
  if (!store || typeof store.transaction !== "function") throw new TypeError("store is required");
  if (typeof verifyCredentials !== "function" || typeof resolveAccess !== "function") throw new TypeError("credential and access resolvers are required");
  if (!Number.isInteger(sessionTtlSeconds) || sessionTtlSeconds < 300 || sessionTtlSeconds > 43200) throw new TypeError("invalid session ttl");

  const surfacesByHost = normalizeSurfaces(loginSurfaces);

  return Object.freeze({
    async login({ host, email, password, productId } = {}) {
      const surface = selectSurface(surfacesByHost, { host, productId });
      const normalizedEmail = req(email, "email").toLowerCase();
      const identity = await verifyCredentials({ email: normalizedEmail, password: req(password, "password") });
      if (!identity || typeof identity !== "object") throw new Error("preview_identity_verification_failed");

      const a = await resolveAccess({
        email: normalizedEmail,
        identity,
        productId: surface.productId,
        requiredScopes: ["web:chat"],
      });
      const principalId = req(a?.principalId, "principalId");
      const tenantId = req(a?.tenantId, "tenantId");
      const workspaceId = req(a?.workspaceId, "workspaceId");
      const accessGrantId = req(a?.accessGrantId, "accessGrantId");

      const now = clock();
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError("invalid clock");
      const issuedAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + sessionTtlSeconds * 1000).toISOString();
      const authenticationEvidence = createUniCoPreviewAuthenticationEvidence({
        principalId,
        tenantId,
        authenticatedAt: issuedAt,
        expiresAt,
      });
      const sessionSecret = generateSecret();
      const sessionHash = hashBrowserSessionSecret(sessionSecret);
      const commercialContextId = createWebAgentShadowCommercialContextId({ tenantId, workspaceId, productId: surface.productId });

      await store.transaction((tx) => {
        tx.put(uniCoPreviewAuthenticationEvidenceCollection, authenticationEvidence.evidenceId, authenticationEvidence, { ifAbsent: true });
        tx.put(C.browserSessions, sessionHash, {
          sessionHash,
          status: "active",
          expiresAt,
          principal: {
            id: principalId,
            tenantId,
            name: req(identity.name ?? normalizedEmail, "identity.name"),
            status: "active",
            scopes: ["web:chat"],
            authenticationEvidenceId: authenticationEvidence.evidenceId,
          },
        }, { ifAbsent: true });
        tx.put(C.tenantInternationalProfiles, tenantId, { tenantId, defaultLocale: "pt-BR", fallbackLocale: "en", timeZone: "America/Sao_Paulo", legalRegion: "BR" });
        tx.put(C.commercialContexts, commercialContextId, { commercialContextId, tenantId, workspaceId, productId: surface.productId, currency: "BRL" });
      });

      return Object.freeze({
        ok: true,
        authenticated: true,
        productId: surface.productId,
        agentId: surface.agentId,
        workspaceId,
        accessGrantId,
        expiresAt,
        setCookie: serializeBrowserSessionCookie({ sessionSecret, maxAgeSeconds: sessionTtlSeconds }),
      });
    },
  });
}
