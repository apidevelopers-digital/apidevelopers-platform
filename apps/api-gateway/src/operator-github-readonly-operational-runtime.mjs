import { createOperationalRuntime } from "./operational-runtime.mjs";
import {
  createOperationalGatewayWithReadonlyOperator,
} from "./operator-readonly-composition.mjs";
import {
  createOperatorGitHubReadonlyStack,
} from "./operator-github-readonly-stack.mjs";

const FORBIDDEN_GATEWAY_OPTION_KEYS = Object.freeze([
  "stateFilePath",
  "adminKey",
  "operatorReadonlyAdapters",
  "githubReadonlyClient",
  "githubReadonlyOrganization",
  "githubReadonlyNow",
]);

function requireFactory(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function normalizeGatewayOptions(value) {
  if (value === undefined) return Object.freeze({});
  const options = requireObject(value, "gatewayOptions");
  for (const key of FORBIDEEN_GATEWAY_OPTION_KEYS) {
    if (Object.hasOwn(options, key)) {
      throw new TypeError(`gatewayOptions.${key} is managed by the runtime wrapper`);
    }
  }
  return Object.freeze({ ...options });
}

export function createOperationalGitHubReadonlyRuntime({
  env = process.env,
  cwd = process.cwd(),
  vaultClient,
  fetchImpl,
  credentialRef,
  organization,
  apiBaseUrl = "https://api.github.com",
  timeoutMs = 10_000,
  maxResponseBytes = 1024 * 1024,
  now = () => new Date(),
  maxLeaseLifetimeMs,
  gatewayOptions,
  runtimeFactory = createOperationalRuntime,
  gatewayFactory = createOperationalGatewayWithReadonlyOperator,
  stackFactory = createOperatorGitHubReadonlyStack,
} = {}) {
  const resolvedRuntimeFactory = requireFactory(runtimeFactory, "runtimeFactory");
  const resolvedGatewayFactory = requireFactory(gatewayFactory, "gatewayFactory");
  const resolvedStackFactory = requireFactory(stackFactory, "stackFactory");
  const resolvedVaultClient = requireObject(vaultClient, "vaultClient");
  const resolvedFetch = requireFactory(fetchImpl, "fetchImpl");
  const resolvedCredentialRef = requireText(credentialRef, "credentialRef");
  const resolvedOrganization = requireText(organization, "organization");
  const resolvedGatewayOptions = normalizeGatewayOptions(gatewayOptions);

  const stack = resolvedStackFactory({
    vaultClient: resolvedVaultClient,
    fetchImpl: resolvedFetch,
    credentialRef: resolvedCredentialRef,
    organization: resolvedOrganization,
    apiBaseUrl,
    timeoutMs,
    maxResponseBytes,
    now,
    ...(maxLeaseLifetimeMs !== undefined ? { maxLeaseLifetimeMs } : {}),
  });

  if (
    !stack ||
    typeof stack !== "object" ||
    !stack.adapters ||
    typeof stack.adapters !== "object"
  ) {
    throw new TypeError("stackFactory returned an invalid read-only stack");
  }

  let gatewayCreated = false;
  const runtime = resolvedRuntimeFactory({
    env,
    cwd,
    gatewayFactory(operationalOptions) {
      if (gatewayCreated) {
        throw new TypeError("operational gateway factory must be invoked exactly once");
      }
      gatewayCreated = true;
      return resolvedGatewayFactory({
        ...resolvedGatewayOptions,
        ...operationalOptions,
        operatorReadonlyAdapters: stack.adapters,
      });
    },
  });

  if (!gatewayCreated) {
    throw new TypeError("runtimeFactory did not create the operational gateway");
  }
  if (!runtime || typeof runtime !== "object" || !runtime.descriptor) {
    throw new TypeError("runtimeFactory returned an invalid operational runtime");
  }

  return Object.freeze({
    ...runtime,
    descriptor: Object.freeze({
      ...runtime.descriptor,
      githubReadonly: Object.freeze({
        provider: "github",
        mode: "read-only",
        organization: resolvedOrganization,
        runtimeWired: true,
        credentialReferenceConfigured: true,
        environmentSecretFallback: false,
        networkCalledDuringComposition: false,
        productionChanged: false,
      }),
    }),
  });
}
