/**
 * Read-only Alexa SMAPI adapter. Never stores LWA credentials or mutates skills.
 * Authentication is injected by the caller and should be backed by a secret manager.
 */
const BASE_URL = "https://api.amazonalexa.com";

export function createSmapiReader({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getAccessToken !== "function") throw new TypeError("getAccessToken must be a function");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  async function get(path, params) {
    const token = await getAccessToken();
    if (typeof token !== "string" || !token.trim()) throw new Error("smapi_auth_unavailable");
    const url = new URL(path, BASE_URL);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value != null) url.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`smapi_http_${response.status}`);
    try { return await response.json(); }
    catch { throw new Error("smapi_invalid_json"); }
  }

  return Object.freeze({
    async listSkills({ vendorId, maxResults = 20, nextToken } = {}) {
      if (typeof vendorId !== "string" || !/^[A-Za-z0-9]+$/.test(vendorId))
        throw new TypeError("invalid_vendor_id");
      if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50)
        throw new RangeError("invalid_max_results");
      if (nextToken != null && (typeof nextToken !== "string" || !nextToken))
        throw new TypeError("invalid_next_token");
      return get("/v1/skills", { vendorId, maxResults, nextToken });
    },
    async getManifest({ skillId, stage = "development" } = {}) {
      if (typeof skillId !== "string" || !/^amzn1\.ask\.skill\.[a-zA-Z0-9-]+$/.test(skillId))
        throw new TypeError("invalid_skill_id");
      if (!["development", "live"].includes(stage))
        throw new TypeError("invalid_stage");
      return get(`/v1/skills/${encodeURIComponent(skillId)}/stages/${stage}/manifest`);
    },
  });
}
