import { pathToFileURL } from "node:url";

const USER_INFO_URL = new URL("https://api.mercadolibre.com/users/me");

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    const error = new Error(`missing required value: ${name}`);
    error.code = "missing_required_value";
    throw error;
  }
  return value.trim();
}

function isTrue(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function createReadOnlyFetch(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  return async (url, init = {}) => {
    const method = String(init.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      const error = new Error(`blocked non-read-only HTTP method: ${method}`);
      error.code = "non_read_only_method_blocked";
      throw error;
    }
    return fetchImpl(url, { ...init, method: "GET" });
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Mercado Pago returned an invalid JSON response");
    error.code = "invalid_json_response";
    error.status = response.status;
    throw error;
  }
}

export async function runMercadoPagoAuthProbe({
  accessToken,
  expectedTestUserId,
  billingMode,
  liveEnabled = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (String(billingMode ?? "").trim().toLowerCase() !== "test") {
    const error = new Error("Mercado Pago auth probe requires APD_BILLING_MODE=test");
    error.code = "test_mode_required";
    throw error;
  }

  if (isTrue(liveEnabled)) {
    const error = new Error("Mercado Pago auth probe refuses live billing enablement");
    error.code = "live_enablement_blocked";
    throw error;
  }

  const token = requireText(accessToken, "MP_ACCESS_TOKEN");
  const expectedId = requireText(expectedTestUserId, "MP_EXPECTED_TEST_USER_ID");
  const safeFetch = createReadOnlyFetch(fetchImpl);

  const response = await safeFetch(USER_INFO_URL, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const error = new Error(`Mercado Pago credential validation failed with HTTP ${response.status}`);
    error.code = "mercadopago_auth_failed";
    error.status = response.status;
    throw error;
  }

  const actualId =
    payload?.id === undefined || payload?.id === null ? "" : String(payload.id).trim();

  if (!actualId) {
    const error = new Error("Mercado Pago credential validation returned no user id");
    error.code = "mercadopago_user_id_missing";
    error.status = response.status;
    throw error;
  }

  if (actualId !== expectedId) {
    const error = new Error("Mercado Pago credential belongs to an unexpected account");
    error.code = "unexpected_mercadopago_account";
    error.status = response.status;
    throw error;
  }

  return Object.freeze({
    ok: true,
    mode: "read-only",
    billingMode: "test",
    writesEnabled: false,
    credentialValidated: true,
    expectedTestAccountMatched: true,
    endpoint: "/users/me",
  });
}

async function main() {
  const result = await runMercadoPagoAuthProbe({
    accessToken: process.env.MP_ACCESS_TOKEN,
    expectedTestUserId: process.env.MP_EXPECTED_TEST_USER_ID,
    billingMode: process.env.APD_BILLING_MODE,
    liveEnabled: process.env.APD_BILLING_LIVE_ENABLED,
  });

  console.log(JSON.stringify(result, null, 2));
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          mode: "read-only",
          writesEnabled: false,
          error: {
            name: error?.name ?? "Error",
            code: error?.code ?? "probe_failed",
            status: error?.status ?? null,
            message: error?.message ?? "Mercado Pago auth probe failed",
          },
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
