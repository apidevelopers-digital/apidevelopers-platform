import { createHash, randomBytes } from "node:crypto";

const AUTHORIZE_URL = "https://www.amazon.com/ap/oa";
const TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const SCOPE = "alexa::ask:skills:read";
const TTL = 300000;

const hash = (text) => createHash("sha256").update(text, "utf8").digest("base64url");
function validateRedirect(uri) {
  let url;
  try { url = new URL(uri); } catch { throw new TypeError("invalid_lwa_redirect"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.search || url.hash) throw new TypeError("invalid_lwa_redirect");
  return url.toString();
}
function assertPrincipal(principal) {
  if (typeof principal !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(principal)) {
    throw new TypeError("invalid_authenticated_principal");
  }
}
function randomBase64(randomFn) {
  const bytes = randomFn(32);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new Error("secure_random_required");
  }
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Only handles LWA consent/exchange. No routes or secret storage are provided.
 * The backend must authenticate users, keep an atomic single-use encrypted
 * pending-state store (5 minute TTL) and persist refresh tokens in a vault.
 */
export function createLwaConsent({
  clientId, redirectUri, createPending, consumePending, getClientSecret,
  saveRefreshToken, fetchImpl = globalThis.fetch,
  randomBytesImpl = randomBytes, now = Date.now,
} = {}) {
  if (typeof clientId !== "string" || !/^[a-zA-Z0-9._:-]{3,150}$/.test(clientId)) {
    throw new TypeError("invalid_lwa_client_id");
  }
  const callback = validateRedirect(redirectUri);
  for (const [name, func] of Object.entries({
    createPending, consumePending, getClientSecret, saveRefreshToken,
    fetchImpl, randomBytesImpl, now,
  })) if (typeof func !== "function") throw new TypeError(`missing_dependency:${name}`);

  async function begin({ principal } = {}) {
    assertPrincipal(principal);
    const state = randomBase64(randomBytesImpl);
    const verifier = randomBase64(randomBytesImpl);
    const expiresAt = now() + TTL;
    await createPending(hash(state), {principal, verifier, expiresAt, redirectUri: callback});
    const url = new URL(AUTHORIZE_URL);
    for (const [k,v] of Object.entries({
      client_id:clientId, scope:SCOPE, response_type:"code",
      redirect_uri:callback, state, code_challenge:hash(verifier),
      code_challenge_method:"S256",
    })) url.searchParams.set(k,v);
    return {authorizationUrl:url.toString(), expiresAt};
  }

  async function finish({principal, callbackUrl} = {}) {
    assertPrincipal(principal);
    let url;
    try { url = new URL(callbackUrl); } catch { throw new Error("lwa_invalid_callback"); }
    const canonical = new URL(callback);
    if (url.protocol !== "https:" || url.origin !== canonical.origin ||
        url.pathname !== canonical.pathname || url.hash || url.username || url.password) {
      throw new Error("lwa_invalid_callback");
    }
    if (url.searchParams.getAll("state").length !== 1) throw new Error("lwa_invalid_state");
    const state = url.searchParams.get("state");
    if (!/^[A-Za-z0-9_-]{43}$/.test(state ?? "")) throw new Error("lwa_invalid_state");
    // consumePending MUST be atomic, one-shot and backed by persistent storage.
    const pending = await consumePending(hash(state));
    if (!pending || pending.principal !== principal ||
        pending.redirectUri !== callback || !Number.isFinite(pending.expiresAt) ||
        now() > pending.expiresAt || pending.expiresAt > now() + TTL ||
        !/^[A-Za-z0-9_-]{43}$/.test(pending.verifier ?? "")) {
      throw new Error("lwa_invalid_or_expired_state");
    }
    if (url.searchParams.has("error")) throw new Error("lwa_consent_denied");
    if (url.searchParams.getAll("code").length !== 1) throw new Error("lwa_invalid_code");
    const code = url.searchParams.get("code");
    if (!/^[A-Za-z0-9|_~-]{18,128}$/.test(code ?? "")) throw new Error("lwa_invalid_code");
    let secret;
    try { secret = await getClientSecret(); } catch {
      throw new Error("lwa_secret_unavailable");
    }
    if (typeof secret !== "string" || !secret) throw new Error("lwa_secret_unavailable");
    const body = new URLSearchParams({
      grant_type:"authorization_code", code, client_id:clientId,
      client_secret:secret, redirect_uri:callback, code_verifier:pending.verifier,
    });
    let response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
        body:body.toString(), redirect:"error", signal:AbortSignal.timeout(15000),
      });
    } catch { throw new Error("lwa_exchange_unavailable"); }
    if (!response?.ok) throw new Error(`lwa_exchange_http_${response?.status ?? "unknown"}`);
    let payload;
    try { payload = await response.json(); } catch {
      throw new Error("lwa_invalid_token_response");
    }
    if (payload?.token_type?.toLowerCase() !== "bearer" ||
        typeof payload.access_token !== "string" || !payload.access_token ||
        typeof payload.refresh_token !== "string" || !payload.refresh_token ||
        !Number.isFinite(payload.expires_in) || payload.expires_in <= 120) {
      throw new Error("lwa_invalid_token_response");
    }
    try {
      await saveRefreshToken({
        principal, refreshToken:payload.refresh_token, clientId, scope:SCOPE,
      });
    } catch { throw new Error("lwa_secret_storage_failed"); }
    return Object.freeze({connected:true, scope:SCOPE});
  }
  return Object.freeze({begin, finish});
}
