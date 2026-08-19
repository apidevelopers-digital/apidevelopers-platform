const DEFAULT_GATEWAY = "https://gateway.apidevelopers.digital";

export function createGatewayClient({ baseUrl = DEFAULT_GATEWAY, fetchImpl = fetch } = {}) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:") throw new Error("gateway_https_required");
  return Object.freeze({
    async createConversation({ cookieHeader = "", payload }) {
      const response = await fetchImpl(new URL("/v1/web-agent/conversations", base), {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookieHeader ? { cookie: cookieHeader } : {}) },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
      return { status: response.status, body };
    }
  });
}
