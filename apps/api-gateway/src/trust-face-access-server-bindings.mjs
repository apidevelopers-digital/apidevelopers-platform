import { createTrustFaceAccessHttpRoutes } from "./trust-face-access-http-routes.mjs";

export function createTrustFaceAccessServerBindings({ trustFaceAccess, parseJsonBody } = {}) {
  if (typeof parseJsonBody !== "function") {
    throw new TypeError("parseJsonBody must be a function");
  }

  const routes = createTrustFaceAccessHttpRoutes({ trustFaceAccess });

  return Object.freeze({
    handle({ method, pathname, body } = {}) {
      const normalizedMethod = String(method ?? "GET").toUpperCase();

      if (
        normalizedMethod === "POST" &&
        pathname === "/v1/trust/face-access/register/verify"
      ) {
        const payload = parseJsonBody(body);
        return routes.registerVerify(payload);
      }

      if (
        normalizedMethod === "POST" &&
        pathname === "/v1/trust/face-access/authenticate/verify"
      ) {
        const payload = parseJsonBody(body);
        return routes.authenticateVerify(payload);
      }

      return null;
    },
  });
}
