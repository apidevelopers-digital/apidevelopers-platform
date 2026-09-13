import {
  createUniJuriBootstrapWriter,
  UNIJURI_BOOTSTRAP_APPROVAL,
} from "./saas-unijuri-bootstrap-writer.mjs";

const ROUTE = "/v1/saas/uni-juri/bootstrap";

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
  clock,
} = {}) {
  const writer = createUniJuriBootstrapWriter({
    authenticator,
    saasRuntime,
    federatedPrincipal,
    audit,
    writeEnabled: writeEnabled === true,
    ...(clock ? { clock } : {}),
  });

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
        const result = await writer.bootstrap({
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
};
