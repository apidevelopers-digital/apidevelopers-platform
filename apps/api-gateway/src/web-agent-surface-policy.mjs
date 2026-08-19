const SURFACE_BINDINGS = Object.freeze({
  "unico.apidevelopers.digital": Object.freeze({
    productId: "product:uni-co",
    agentId: "uni.co",
  }),
  "unico-preview.apidevelopers.digital": Object.freeze({
    productId: "product:uni-co",
    agentId: "uni.co",
  }),
  "nexus.apidevelopers.digital": Object.freeze({
    productId: "product:nexus",
    agentId: "nexus",
  }),
});

function normalizeHost(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const host = trimmed.split(",", 1)[0].trim();
  const withoutPort = host.replace(/:\d+$/, "");
  return withoutPort.endsWith(".") ? withoutPort.slice(0, -1) : withoutPort;
}

export function resolveWebAgentSurface(hostHeader) {
  const host = normalizeHost(hostHeader);
  const binding = SURFACE_BINDINGS[host];
  if (!binding) return null;
  return Object.freeze({ host, ...binding });
}

export function bindWebAgentSurfaceRequest({ headers = {}, body } = {}) {
  const surface = resolveWebAgentSurface(headers.host);
  if (!surface) {
    return Object.freeze({ body, surface: null });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Object.freeze({ body, surface });
  }

  const productMismatch =
    typeof body.productId === "string" &&
    body.productId.trim() &&
    body.productId.trim() !== surface.productId;
  const agentMismatch =
    typeof body.agentId === "string" &&
    body.agentId.trim() &&
    body.agentId.trim() !== surface.agentId;

  if (productMismatch || agentMismatch) {
    const error = new Error("product_surface_agent_mismatch");
    error.code = "product_surface_agent_mismatch";
    error.status = 403;
    throw error;
  }

  return Object.freeze({
    surface,
    body: Object.freeze({
      ...body,
      productId: surface.productId,
      agentId: surface.agentId,
    }),
  });
}
