import { createOperatorSecretHandoffHttpApp } from "./operator-secret-handoff-http.mjs";
import {
  createSecretHandoffOperatorSecretProvider,
} from "./operator-secret-handoff-provider.mjs";
import { createSecretHandoffService } from "./secret-handoff.mjs";

function parseEnabled(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new TypeError("OPERATOR_SECRET_HANDOFF_ENABLED must be true or false");
}

function requireAdminKeyConfigured(config) {
  if (!config?.adminKeyConfigured) {
    throw new TypeError(
      "OPERATOR_SECRET_HANDOFF_ENABLED=true requires API_GATEWAY_ADMIN_KEY",
    );
  }
}

export function createOperatorSecretHandoffOperationalComposition({
  app,
  authenticator,
  authorization,
  runtimeDescriptor,
  env = process.env,
  handoffServiceFactory = createSecretHandoffService,
  handoffHttpAppFactory = createOperatorSecretHandoffHttpApp,
  handoffProviderFactory = createSecretHandoffOperatorSecretProvider,
} = {}) {
  const enabled = parseEnabled(env.OPERATOR_SECRET_HANDOFF_ENABLED);
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      descriptor: Object.freeze({
        enabled: false,
        transport: "binary-octet-stream",
        persistence: "ephemeral-memory",
        productionChanged: false,
      }),
    });
  }

  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate is required");
  }
  if (typeof authorization?.decide !== "function") {
    throw new TypeError("authorization.decide is required");
  }
  requireAdminKeyConfigured(runtimeDescriptor);

  const handoffService = handoffServiceFactory();
  const httpApp = handoffHttpAppFactory({
    app,
    authenticator,
    authorization,
    handoffService,
  });
  const secretProvider = handoffProviderFactory({ handoffService });

  if (typeof httpApp?.handleRequest !== "function") {
    throw new TypeError("secret handoff HTTP app is unavailable");
  }
  if (typeof secretProvider?.withSecret !== "function") {
    throw new TypeError("secret handoff provider is unavailable");
  }

  return Object.freeze({
    enabled: true,
    httpApp,
    handoffService,
    secretProvider,
    descriptor: Object.freeze({
      enabled: true,
      transport: "binary-octet-stream",
      persistence: "ephemeral-memory",
      authentication: "gateway-canonical",
      requiredScope: "admin:*",
      oneTimeConsumption: true,
      productionChanged: false,
    }),
  });
}
