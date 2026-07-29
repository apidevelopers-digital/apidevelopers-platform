import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

function blockedError(operation) {
  const error = new Error(`staging network guard blocked ${operation}`);
  error.code = "STAGING_EGRESS_BLOCKED";
  error.operation = operation;
  return error;
}

function requireTelemetry(telemetry) {
  if (!telemetry || typeof telemetry.recordNetworkAttempt !== "function") {
    throw new TypeError("telemetry.recordNetworkAttempt is required");
  }
  return telemetry;
}

export function createGlobalTrustStagingNetworkGuard({ telemetry } = {}) {
  const sink = requireTelemetry(telemetry);
  let installed = false;
  let originals = null;

  function block(operation) {
    return function blockedNetworkOperation() {
      sink.recordNetworkAttempt({ operation, blocked: true });
      throw blockedError(operation);
    };
  }

  return Object.freeze({
    get installed() {
      return installed;
    },

    install() {
      if (installed) throw new Error("staging network guard is already installed");

      originals = {
        fetch: globalThis.fetch,
        httpRequest: http.request,
        httpGet: http.get,
        httpsRequest: https.request,
        httpsGet: https.get,
        netConnect: net.connect,
        netCreateConnection: net.createConnection,
        tlsConnect: tls.connect,
      };

      try {
        if (typeof globalThis.fetch === "function") {
          globalThis.fetch = async function blockedFetch() {
            sink.recordNetworkAttempt({ operation: "fetch", blocked: true });
            throw blockedError("fetch");
          };
        }
        http.request = block("http.request");
        http.get = block("http.get");
        https.request = block("https.request");
        https.get = block("https.get");
        net.connect = block("net.connect");
        net.createConnection = block("net.createConnection");
        tls.connect = block("tls.connect");
        installed = true;
      } catch (cause) {
        try {
          this.uninstall();
        } catch {
          // Best effort rollback after an install failure.
        }
        const error = new Error("unable to install staging network guard", { cause });
        error.code = "STAGING_NETWORK_GUARD_INSTALL_FAILED";
        throw error;
      }

      return Object.freeze({ installed: true, mode: "deny-all" });
    },

    uninstall() {
      if (!originals) {
        installed = false;
        return Object.freeze({ installed: false });
      }

      if (originals.fetch === undefined) {
        delete globalThis.fetch;
      } else {
        globalThis.fetch = originals.fetch;
      }
      http.request = originals.httpRequest;
      http.get = originals.httpGet;
      https.request = originals.httpsRequest;
      https.get = originals.httpsGet;
      net.connect = originals.netConnect;
      net.createConnection = originals.netCreateConnection;
      tls.connect = originals.tlsConnect;

      originals = null;
      installed = false;
      return Object.freeze({ installed: false });
    },
  });
}
