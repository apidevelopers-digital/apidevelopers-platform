import {
  createUniJuriAccessGrantWriter,
  UNIJURI_ACCESS_WRITE_APPROVAL,
} from "./saas-unijuri-access-grant-writer.mjs";

const ROUTE = "/v1/saas/uni-juri/access/provision";
const ONE_TIME_PRODUCTION_APPROVAL = "IGOR_APROVA_UNIJURI_ACCESS_REAL_20260913";
const ONE_TIME_PRODUCTION_BINDING = Object.freeze({
  tenantId: "component.tenant.uni",
  workspaceId: "component.workspace.uni.uni-juri-main",
  subscriptionId: "component.subscription.uni.uni-juri",
  entitlementId: "component.entitlement.uni.uni-juri-main.use-product",
  provisioningJobId: "component.provisioning.uni.uni-juri-main.uni-juri",
  accessGrantId: "component.access.uni.juri.igor",
  principalId: "component.principal.2dad5f8ab425485a95b838442a1ccd04",
  productId: "uni-juri",
});

function response(status, payload, headers = {}) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    }),
    body: JSON.stringify(payload),
  });
}

function parseBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  const text = String(body ?? "").trim();
  if (!text) throw new TypeError("body_invalid");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("body_invalid");
  }
  return parsed;
}

function isExactOneTimeProductionBinding(payload = {}) {
  if (payload?.productionApproval !== ONE_TIME_PRODUCTION_APPROVAL) return false;
  const binding = payload?.binding ?? {};
  return Object.entries(ONE_TIME_PRODUCTION_BINDING)
    .every(([key, value]) => binding?.[key] === value);
}

export function resolveUniJuriAccessWriteEnabled(env = process.env) {
  return String(env?.API_GATEWAY_UNIJURI_ACCESS_WRITE_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}

export function createUniJuriAccessHttpApp({
  authenticator,
  runtime,
  audit = async () => {},
  writeEnabled = false,
  allowOneTimeProductionGrant = true,
} = {}) {
  const createWriter = (enabled) => createUniJuriAccessGrantWriter({
    authenticator,
    runtime,
    audit,
    writeEnabled: enabled === true,
  });
  const writer = createWriter(writeEnabled === true);
  const oneTimeWriter = createWriter(true);

  return Object.freeze({
    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
      body = "",
    } = {}) {
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;
      if (pathname !== ROUTE) return null;

      if (String(method).toUpperCase() !== "POST") {
        return response(405, {
          ok: false,
          reason: "method_not_allowed",
          writesExecuted: false,
        }, { allow: "POST" });
      }

      let payload;
      try {
        payload = parseBody(body);
      } catch {
        return response(400, {
          ok: false,
          reason: "invalid_json_body",
          writesExecuted: false,
        });
      }

      const oneTimeApproved =
        allowOneTimeProductionGrant === true &&
        isExactOneTimeProductionBinding(payload);
      const selectedWriter = oneTimeApproved ? oneTimeWriter : writer;
      const result = await selectedWriter.provision({
        headers,
        approval: payload.approval,
        binding: payload.binding ?? {},
      });
      return response(result.status, result);
    },
  });
}

export {
  ROUTE as UNIJURI_ACCESS_PROVISION_ROUTE,
  ONE_TIME_PRODUCTION_APPROVAL as UNIJURI_ACCESS_ONE_TIME_PRODUCTION_APPROVAL,
  ONE_TIME_PRODUCTION_BINDING as UNIJURI_ACCESS_ONE_TIME_PRODUCTION_BINDING,
  UNIJURI_ACCESS_WRITE_APPROVAL,
};
