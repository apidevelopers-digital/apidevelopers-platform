const ZUNI_READINESS_URL = "https://zuni.sitedauni.com/api/readiness.php";
const SHA40 = /^[0-9a-f]{40}$/;

function requireFetch(fetchFn) {
  if (typeof fetchFn !== "function") {
    throw new TypeError("fetch implementation is required");
  }
  return fetchFn;
}

function fail(code, extra = {}) {
  return Object.freeze({
    ready: false,
    code,
    source: "zuni.public.readiness",
    endpoint: ZUNI_READINESS_URL,
    ...extra,
  });
}

export function createZuniPublicReadinessProbe({
  fetchFn = globalThis.fetch,
  timeoutMs = 5000,
} = {}) {
  const fetchImpl = requireFetch(fetchFn);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new TypeError("timeoutMs must be an integer between 100 and 30000");
  }

  return async function probeZuniProductReadiness() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();

    let response;
    try {
      response = await fetchImpl(ZUNI_READINESS_URL, {
        method: "GET",
        redirect: "error",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
        signal: controller.signal,
      });
    } catch (error) {
      return fail(error?.name === "AbortError" ? "zuni_readiness_timeout" : "zuni_readiness_unreachable");
    } finally {
      clearTimeout(timeout);
    }

    if (!response || response.status !== 200 || response.ok !== true) {
      return fail("zuni_readiness_http_not_ready", {
        httpStatus: Number.isInteger(response?.status) ? response.status : null,
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return fail("zuni_readiness_invalid_json");
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return fail("zuni_readiness_invalid_payload");
    }

    const releaseSha = String(payload.releaseSha ?? "");
    const checks = {
      ok: payload.ok === true,
      ready: payload.ready === true,
      product: payload.product === "zuni",
      environment: payload.environment === "production",
      transport: payload.transport === "git",
      releaseSha: SHA40.test(releaseSha),
      secrets: payload.secretsExposed === false,
    };
    const failedChecks = Object.entries(checks)
      .filter(([, value]) => value !== true)
      .map(([key]) => key);

    if (failedChecks.length > 0) {
      return fail("zuni_readiness_contract_failed", {
        failedChecks,
        releaseSha: SHA40.test(releaseSha) ? releaseSha : null,
      });
    }

    return Object.freeze({
      ready: true,
      productId: "zuni",
      environment: "production",
      releaseSha,
      transport: "git",
      source: "zuni.public.readiness",
      endpoint: ZUNI_READINESS_URL,
      evidence: Object.freeze({
        releaseSha,
        transport: "git",
        environment: "production",
        checks: payload.checks && typeof payload.checks === "object" ? payload.checks : {},
      }),
    });
  };
}

export { ZUNI_READINESS_URL };
