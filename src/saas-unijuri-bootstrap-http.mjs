import {
  createUniJuriBootstrapWriter,
  UNIJURI_BOOTSTRAP_APPROVAL,
} from "./saas-unijuri-bootstrap-writer.mjs";

const ROUTE = "/v1/saas/uni-juri/bootstrap";
const ONE_TIME_PRODUCTION_APPROVAL = "IGOR_APROVA_UNIJURI_BOOTSTRAP_REAL_20260913";
const ONE_TIME_PRODUCTION_INPUT = Object.freeze({
  tenantSlug: "uni",
  workspaceSlug: "uni-juri-main",
  displayName: "UNI",
  planId: "internal",
  idempotencyKey: "unijuri-bootstrap-prod-20260913-v1",
});

function response(status, payload) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    }),
    body: JSON.stringify(payload),
  });
}

function bodyOf(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("body_invalid");
  }
  return parsed;
}

function isExactOneTimeProductionBootstrap(payload = {}) {
  if (payload?.productionApproval !== ONE_TIME_PRODUCTION_APPROVAL) return false;
  const input = payload?.input ?? {};
  return Object.entries(ONE_TIME_PRODUCTION_INPUT)
    .every(([key, value]) => input?.[key] === value);
}

export function resolveUniJuriBootstrapWriteEnabled(
  env = process.env,
) {
  return String(env?.UNIJURI_BOOTSTRAP_WRITE_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}

export function createUniJuriBootstrapHttpApp({
  authenticator,
  saasRuntime,
  federatedPrincipal,
  audit = async () => {},
  writeEnabled = false,
  // TEMPORARY production bridge: remove immediately after the governed bootstrap completes.
  allowOneTimeProductionBootstrap = true,
  clock,
} = {}) {
  const createWriter = (enabled) => createUniJuriBootstrapWriter({
    authenticator,
    saasRuntime,
    federatedPrincipal,
    audit,
    writeEnabled: enabled === true,
    ...(clock ? { clock } : {}),
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
          chargeExecuted: false,
          secretsExposed: false,
        });
      }

      let payload;
      try {
        payload = bodyOf(body);
      } catch (error) {
        return response(400, {
          ok: false,
          reason: "invalid_json_body",
          message: error instanceof Error ? error.message : "invalid_json_body",
          writesExecuted: false,
          chargeExecuted: false,
          secretsExposed: false,
        });
      }

      try {
        const oneTimeApproved =
          allowOneTimeProductionBootstrap === true &&
          isExactOneTimeProductionBootstrap(payload);
        const selectedWriter = oneTimeApproved ? oneTimeWriter : writer;
        const result = await selectedWriter.bootstrap({
          headers,
          approval: payload.approval,
          input: payload.input ?? {},
        });
        return response(result.status, result);
      } catch (error) {
        const validationError = error instanceof TypeError;
        return response(validationError ? 400 : 500, {
          ok: false,
          reason: validationError
            ? "invalid_unijuri_bootstrap_input"
            : "unijuri_bootstrap_failed",
          message: error instanceof Error ? error.message : "unijuri_bootstrap_failed",
          writesExecuted: validationError ? false : null,
          chargeExecuted: false,
          secretsExposed: false,
        });
      }
    },
  });
}

export {
  ROUTE as UNIJURI_BOOTSTRAP_ROUTE,
  UNIJURI_BOOTSTRAP_APPROVAL,
  ONE_TIME_PRODUCTION_APPROVAL as UNIJURI_ONE_TIME_PRODUCTION_APPROVAL,
};
