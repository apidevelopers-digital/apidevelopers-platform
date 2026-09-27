import { createMitraMcpV1HttpApp } from "./mitra-mcp-v1-http.mjs";

export function attachMitraMcpV1ToGateway({ gateway }) {
  if (typeof gateway?.app?.handleRequest !== "function") {
    throw new TypeError("gateway.app.handleRequest must be a function");
  }
  if (typeof gateway?.authenticator?.authenticate !== "function") {
    throw new TypeError("gateway.authenticator.authenticate must be a function");
  }

  const mitraMcpV1HttpApp = createMitraMcpV1HttpApp({
    app: gateway.app,
    authenticator: gateway.authenticator,
  });

  return Object.freeze({
    ...gateway,
    mitraMcpV1HttpApp,
    app: mitraMcpV1HttpApp,
  });
}
