import {
  createUniJuriProductionHandoffComposition,
} from "./browser-session-handoff-unijuri-production-composition.mjs";

function parseBooleanFlag(value, name) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new TypeError(`${name} must be true or false`);
}

export function resolveUniJuriProductionHandoffEnabled(env = process.env) {
  return parseBooleanFlag(
    env.UNIJURI_PRODUCTION_HANDOFF_ENABLED,
    "UNIJURI_PRODUCTION_HANDOFF_ENABLED",
  );
}

export function attachUniJuriProductionHandoffToGateway({
  gateway,
  env = process.env,
  compositionFactory = createUniJuriProductionHandoffComposition,
} = {}) {
  if (!gateway || typeof gateway !== "object") {
    throw new TypeError("gateway is required");
  }
  if (typeof gateway.app?.handleRequest !== "function") {
    throw new TypeError("gateway.app.handleRequest must be a function");
  }
  if (typeof compositionFactory !== "function") {
    throw new TypeError("compositionFactory must be a function");
  }

  const enabled = resolveUniJuriProductionHandoffEnabled(env);
  const composition = compositionFactory({
    app: gateway.app,
    persistenceStore: gateway.store,
    sourceAuthenticator: gateway.authenticator,
    redeemerAuthenticator: gateway.authenticator,
    enabled,
  });

  if (
    enabled &&
    (composition?.enabled !== true ||
      typeof composition?.app?.handleRequest !== "function")
  ) {
    throw new TypeError("configured UniJuri production handoff is unavailable");
  }

  return Object.freeze({
    ...gateway,
    app: composition?.app ?? gateway.app,
    uniJuriProductionHandoff: composition?.descriptor,
  });
}
