// LWA refresh-token broker. No credentials or tokens are persisted here.
const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

export function createLwaTokenProvider({
  getCredentials,
  saveRefreshToken,
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  if (typeof getCredentials !== "function" || typeof saveRefreshToken !== "function") {
    throw new TypeError("secret storage callbacks are required");
  }
  if (typeof fetchImpl !== "function" || typeof now !== "function") {
    throw new TypeError("invalid runtime callbacks");
  }

  let cached = null;
  let pending = null;

  async function renew() {
    let credentials;
    try {
      credentials = await getCredentials();
    } catch {
      throw new Error("lwa_credentials_unavailable");
    }
    const { clientId, clientSecret, refreshToken } = credentials ?? {};
    if (![clientId, clientSecret, refreshToken].every((v) => typeof v === "string" && v.length > 0)) {
      throw new Error("lwa_credentials_unavailable");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
    let response;
    try {
      response = await fetchImpl(LWA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: body.toString(),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error("lwa_network_unavailable");
    }
    if (!response.ok) throw new Error(`lwa_http_${response.status}`);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("lwa_invalid_response");
    }
    if (
      typeof payload?.access_token !== "string" ||
      !payload.access_token ||
      !Number.isFinite(payload.expires_in) ||
      payload.expires_in <= 120
    ) {
      throw new Error("lwa_invalid_response");
    }
    if (payload.refresh_token != null && payload.refresh_token !== refreshToken) {
      if (typeof payload.refresh_token !== "string" || !payload.refresh_token) {
        throw new Error("lwa_invalid_response");
      }
      try {
        await saveRefreshToken(payload.refresh_token);
      } catch {
        throw new Error("lwa_secret_storage_failed");
      }
    }
    cached = { value: payload.access_token, expiresAt: now() + payload.expires_in * 1000 };
    return cached.value;
  }

  return Object.freeze({
    async getAccessToken() {
      if (cached && now() < cached.expiresAt - 60000) return cached.value;
      if (!pending) {
        pending = renew().finally(() => { pending = null; });
      }
      return pending;
    },
  });
}
