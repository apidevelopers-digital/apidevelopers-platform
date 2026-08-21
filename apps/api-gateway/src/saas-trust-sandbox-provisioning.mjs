import { authorize } from "@apidevelopers/auth-core";
import {
  createCanonicalId,
  createTenantId,
  createWorkspaceId,
  TRUST_PRODUCT_ID,
  TRUST_SANDBOX_ENVIRONMENT,
  TRUST_SANDBOX_PROVISIONING_CONTRACT,
  TRUST_SANDBOX_SCOPES,
} from "@apidevelopers/contracts";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const reply = (status, payload) => Object.freeze({
  status,
  headers: Object.freeze({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  }),
  body: JSON.stringify(payload),
});

function requiredText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name}_required`);
  return normalized;
}

function requiredSlug(value, name) {
  const normalized = requiredText(value, name).toLowerCase();
  if (!SLUG.test(normalized)) throw new TypeError(`${name}_invalid`);
  return normalized;
}

function bodyOf(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) throw new TypeError("body_required");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("body_invalid");
  }
  return parsed;
}

function sameScopes(actual = [], expected = []) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((scope, index) => scope === right[index]);
}

export function createTrustSandboxProvisioningApp({
  authenticator,
  saasRuntime,
  apiKeyLifecycle,
  clock = () => new Date().toISOString(),
} = {}) {
  for (const [name, fn] of Object.entries({
    authenticate: authenticator?.authenticate,
    registerTenantWorkspace: saasRuntime?.registerTenantWorkspace,
    issueApiKey: apiKeyLifecycle?.issueApiKey,
    listApiKeys: apiKeyLifecycle?.listApiKeys,
  })) {
    if (typeof fn !== "function") throw new TypeError(`${name}_function_required`);
  }

  return Object.freeze({
    async handleRequest({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
      const pathname = new URL(String(url), "http://gateway.local").pathname;
      if (
        String(method).toUpperCase() !== "POST" ||
        pathname !== TRUST_SANDBOX_PROVISIONING_CONTRACT.path
      ) {
        return null;
      }

      const actor = await authenticator.authenticate(headers);
      if (!actor) return reply(401, { ok: false, reason: "unauthorized" });

      const authz = authorize(actor, {
        scopes: [TRUST_SANDBOX_PROVISIONING_CONTRACT.requiredProvisioningScope],
      });
      if (!authz.allowed) {
        return reply(403, {
          ok: false,
          reason: "provision_scope_forbidden",
          missingScopes: authz.missingScopes,
        });
      }

      try {
        const input = bodyOf(body);
        const tenantSlug = requiredSlug(input.tenantSlug, "tenantSlug");
        const workspaceSlug = requiredSlug(input.workspaceSlug, "workspaceSlug");
        const displayName = requiredText(input.displayName, "displayName");
        const tenantId = createTenantId(tenantSlug);
        const workspaceId = createWorkspaceId(tenantSlug, workspaceSlug);
        const createdAt = clock();

        await saasRuntime.registerTenantWorkspace({
          tenant: {
            tenantId,
            organizationId: createCanonicalId({
              family: "component",
              segments: ["organization", tenantSlug],
            }),
            slug: tenantSlug,
            displayName,
            status: "active",
            createdAt,
          },
          workspace: {
            workspaceId,
            tenantId,
            productId: TRUST_PRODUCT_ID,
            slug: workspaceSlug,
            displayName: `${displayName} · Trust sandbox`,
            status: "active",
            createdAt,
          },
        });

        const credentialName = `Trust sandbox · ${workspaceSlug}`;
        const activeKeys = await apiKeyLifecycle.listApiKeys(tenantId, { status: "active" });
        const existing = activeKeys.find(
          (record) =>
            record.name === credentialName &&
            sameScopes(record.scopes, TRUST_SANDBOX_SCOPES),
        );

        if (existing) {
          return reply(409, {
            ok: false,
            reason: "trust_sandbox_credential_already_exists",
            tenantId,
            workspaceId,
            productId: TRUST_PRODUCT_ID,
            environment: TRUST_SANDBOX_ENVIRONMENT,
            credential: {
              id: existing.id,
              prefix: existing.prefix,
              scopes: [...existing.scopes],
            },
            secretsExposed: false,
          });
        }

        const issued = await apiKeyLifecycle.issueApiKey({
          tenantId,
          name: credentialName,
          scopes: [...TRUST_SANDBOX_SCOPES],
        });

        return reply(201, {
          ok: true,
          provisioned: true,
          tenantId,
          workspaceId,
          productId: TRUST_PRODUCT_ID,
          environment: TRUST_SANDBOX_ENVIRONMENT,
          credential: {
            id: issued.apiKey.id,
            prefix: issued.apiKey.prefix,
            scopes: [...issued.apiKey.scopes],
            secret: issued.secret,
            oneTime: true,
          },
          secretPersistence: "hash-only",
          secretsExposed: true,
          realBiometrics: false,
          realMoney: false,
          productionPromotion: false,
        });
      } catch (error) {
        const message = String(error?.message ?? "");
        const invalid = /required|invalid|JSON/i.test(message);
        return reply(invalid ? 400 : 409, {
          ok: false,
          reason: invalid
            ? "invalid_trust_sandbox_provision_request"
            : "trust_sandbox_provisioning_failed",
          secretsExposed: false,
        });
      }
    },
  });
}

export const trustSandboxProvisioningContract = TRUST_SANDBOX_PROVISIONING_CONTRACT;
