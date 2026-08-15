import { resolve } from "node:path";

import {
  createOperatorGitHubRuntime,
} from "./operator-github-runtime.mjs";
import {
  createOperatorGitHubReadonlyTransport,
} from "./operator-github-readonly-transport.mjs";
import {
  createOperatorSecretResolverProvider,
} from "./operator-secret-resolver-provider.mjs";
import {
  createOperatorVaultSecretProvider,
} from "./operator-vault-secret-provider.mjs";
import {
  createOperationalGatewayWithReadonlyOperator,
} from "./operator-readonly-composition.mjs";

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function hasGitHubRuntimeConfiguration(env) {
  return Boolean(
    optionalText(env.OPERATOR_GITHUB_ORGANIZATION) &&
      optionalText(env.OPERATOR_GITHUB_CREDENTIAL_REF),
  );
}

function parsePort(value) {
  const normalized = String(value ?? "3000").trim();
  const port = Number(normalized);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("PORT must be an integer between 0 and 65535");
  }
  return port;
}

export function resolveOperationalRuntimeConfig({
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const stateFilePath = resolve(
    cwd,
    requireText(env.API_GATEWAY_STATE_FILE, "API_GATEWAY_STATE_FILE"),
  );
  const adminKey = optionalText(env.API_GATEWAY_ADMIN_KEY);

  return Object.freeze({
    host: optionalText(env.HOST) ?? "127.0.0.1",
    port: parsePort(env.PORT),
    stateFilePath,
    ...(adminKey ? { adminKey } : {}),
  });
}

export function createOperationalRuntime({
  env = process.env,
  cwd = process.cwd(),
  gatewayFactory = createOperationalGatewayWithReadonlyOperator,
  gatewayTransform = ({ gateway }) => gateway,
  githubRuntimeFactory = createOperatorGitHubRuntime,
  githubTransportFactory = createOperatorGitHubReadonlyTransport,
  githubSecretProviderFactory = createOperatorSecretResolverProvider,
  githubVaultSecretProviderFactory = createOperatorVaultSecretProvider,
  githubSecretResolver,
  githubVaultClient,
  githubSecretProvider,
  githubTransport,
  delegatedBindingSigner,
} = {}) {
  if (typeof gatewayFactory !== "function") {
    throw new TypeError("gatewayFactory must be a function");
  }
  if (typeof gatewayTransform !== "function") {
    throw new TypeError("gatewayTransform must be a function");
  }
  if (typeof githubRuntimeFactory !== "function") {
    throw new TypeError("githubRuntimeFactory must be a function");
  }
  if (
    delegatedBindingSigner !== undefined &&
    typeof delegatedBindingSigner?.signBinding !== "function"
  ) {
    throw new TypeError(
      "delegatedBindingSigner.signBinding must be a function",
    );
  }

  const config = resolveOperationalRuntimeConfig({ env, cwd });
  const githubConfigured = hasGitHubRuntimeConfiguration(env);
  const credentialRef = optionalText(env.OPERATOR_GITHUB_CREDENTIAL_REF);

  let resolvedGitHubTransport = githubTransport;
  let resolvedGitHubSecretProvider = githubSecretProvider;

  if (!resolvedGitHubTransport && githubConfigured) {
    if (typeof githubTransportFactory !== "function") {
      throw new TypeError("githubTransportFactory must be a function");
    }
    resolvedGitHubTransport = githubTransportFactory();
  }

  if (!resolvedGitHubSecretProvider && githubConfigured && githubVaultClient) {
    if (typeof githubVaultSecretProviderFactory !== "function") {
      throw new TypeError("githubVaultSecretProviderFactory must be a function");
    }
    resolvedGitHubSecretProvider = githubVaultSecretProviderFactory({
      vaultClient: githubVaultClient,
      allowedSecretRefs: [credentialRef],
    });
  }

  if (
    !resolvedGitHubSecretProvider &&
    githubConfigured &&
    githubSecretResolver
  ) {
    if (typeof githubSecretProviderFactory !== "function") {
      throw new TypeError("githubSecretProviderFactory must be a function");
    }
    resolvedGitHubSecretProvider = githubSecretProviderFactory({
      resolveSecret: githubSecretResolver,
    });
  }

  const githubRuntime = githubRuntimeFactory({
    env,
    secretProvider: resolvedGitHubSecretProvider,
    transport: resolvedGitHubTransport,
  });

  const baseGateway = gatewayFactory({
    stateFilePath: config.stateFilePath,
    ...(config.adminKey ? { adminKey: config.adminKey } : {}),
    ...(delegatedBindingSigner ? { delegatedBindingSigner } : {}),
    ...(githubRuntime.configured
      ? {
          githubReadonlyClient: githubRuntime.client,
          githubReadonlyOrganization: githubRuntime.organization,
        }
      : {}),
  });

  const gateway = gatewayTransform({
    gateway: baseGateway,
    env,
    cwd,
    config,
  });

  if (typeof gateway?.app?.handleRequest !== "function") {
    throw new TypeError("operational gateway app is unavailable");
  }

  return Object.freeze({
    mode: "operational",
    host: config.host,
    port: config.port,
    app: gateway.app,
    readiness: gateway.readiness,
    store: gateway.store,
    descriptor: Object.freeze({
      mode: "operational",
      stateStore: "json-file",
      adminKeyConfigured: Boolean(config.adminKey),
      githubReadonly: githubRuntime.descriptor,
      ...(delegatedBindingSigner
        ? { delegatedBindingSignerConfigured: true }
        : {}),
    }),
  });
}
