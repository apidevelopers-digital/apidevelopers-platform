import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startOperationalHttpServer } from "./operational-http-transport.mjs";
import { createOperationalRuntime } from "./operational-runtime.mjs";
import { resolveProductAwareDelegatedBindingOperationalSigner } from "./saas-delegated-binding-operational-resolver.mjs";
import { runUniCoPreviewBootstrap } from "./uni-co-preview-bootstrap.mjs";

function writeLog(logger, payload) {
  if (typeof logger?.log === "function") {
    logger.log(JSON.stringify(payload));
  }
}

function parseBooleanFlag(value, name) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new TypeError(`${name} must be true or false`);
}

export function resolveTrustEvaluationEnabled(env = process.env) {
  return parseBooleanFlag(
    env.GLOBAL_TRUST_EVALUATION_ENABLED,
    "GLOBAL_TRUST_EVALUATION_ENABLED",
  );
}

export function resolveTrustEvaluationPortalEnabled(env = process.env) {
  return parseBooleanFlag(
    env.GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED,
    "GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED",
  );
}

export function isDirectExecution(options = {}) {
  const moduleUrl = Object.hasOwn(options, "moduleUrl")
    ? options.moduleUrl
    : import.meta.url;
  const argvPath = Object.hasOwn(options, "argvPath")
    ? options.argvPath
    : process.argv[1];

  if (!moduleUrl || !argvPath) return false;

  try {
    return (
      realpathSync(fileURLToPath(moduleUrl)) ===
      realpathSync(resolve(argvPath))
    );
  } catch {
    return false;
  }
}

export async function startOperationalGateway({
  env = process.env,
  cwd = process.cwd(),
  logger = console,
  runtimeFactory = createOperationalRuntime,
  serverFactory = startOperationalHttpServer,
  delegatedBindingSigner,
  delegatedBindingSecretProvider,
  delegatedBindingSignerResolver = resolveProductAwareDelegatedBindingOperationalSigner,
  trustEvaluationLoader = () =>
    import("./operational-trust-evaluation-composition.mjs"),
  trustEvaluationPortalLoader = () =>
    import("./operational-trust-evaluation-portal-composition.mjs"),
} = {}) {
  if (typeof runtimeFactory !== "function") {
    throw new TypeError("runtimeFactory must be a function");
  }
  if (typeof serverFactory !== "function") {
    throw new TypeError("serverFactory must be a function");
  }
  if (
    delegatedBindingSigner !== undefined &&
    typeof delegatedBindingSigner?.signBinding !== "function"
  ) {
    throw new TypeError(
      "delegatedBindingSigner.signBinding must be a function",
    );
  }
  if (
    delegatedBindingSignerResolver !== undefined &&
    typeof delegatedBindingSignerResolver !== "function"
  ) {
    throw new TypeError(
      "delegatedBindingSignerResolver must be a function",
    );
  }

  let resolvedDelegatedBindingSigner = delegatedBindingSigner;
  let delegatedBindingDescriptor;

  if (!resolvedDelegatedBindingSigner) {
    const resolvedBinding = await delegatedBindingSignerResolver({
      env,
      secretProvider: delegatedBindingSecretProvider,
    });

    if (resolvedBinding?.configured) {
      if (typeof resolvedBinding.signer?.signBinding !== "function") {
        throw new TypeError(
          "resolved delegated binding signer must expose signBinding",
        );
      }
      resolvedDelegatedBindingSigner = resolvedBinding.signer;
    }

    delegatedBindingDescriptor = resolvedBinding?.descriptor;
  }

  const trustEvaluationEnabled = resolveTrustEvaluationEnabled(env);
  const trustEvaluationPortalEnabled =
    resolveTrustEvaluationPortalEnabled(env);

  if (trustEvaluationPortalEnabled && !trustEvaluationEnabled) {
    throw new TypeError(
      "GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED requires GLOBAL_TRUST_EVALUATION_ENABLED=true",
    );
  }

  let gatewayTransform;

  if (trustEvaluationEnabled) {
    if (typeof trustEvaluationLoader !== "function") {
      throw new TypeError("trustEvaluationLoader must be a function");
    }

    const evaluationModule = await trustEvaluationLoader();
    const attachEvaluation =
      evaluationModule?.attachOperationalTrustEvaluationGateway;
    if (typeof attachEvaluation !== "function") {
      throw new TypeError(
        "Trust Evaluation module must export attachOperationalTrustEvaluationGateway",
      );
    }

    let attachPortal = null;
    if (trustEvaluationPortalEnabled) {
      if (typeof trustEvaluationPortalLoader !== "function") {
        throw new TypeError(
          "trustEvaluationPortalLoader must be a function",
        );
      }
      const portalModule = await trustEvaluationPortalLoader();
      attachPortal =
        portalModule?.attachOperationalTrustEvaluationPortal;
      if (typeof attachPortal !== "function") {
        throw new TypeError(
          "Trust Evaluation Portal module must export attachOperationalTrustEvaluationPortal",
        );
      }
    }

    gatewayTransform = ({ gateway }) => {
      const evaluationGateway = attachEvaluation({ gateway });
      return attachPortal
        ? attachPortal({ gateway: evaluationGateway })
        : evaluationGateway;
    };
  }

  const runtime = runtimeFactory({
    env,
    cwd,
    ...(resolvedDelegatedBindingSigner
      ? { delegatedBindingSigner: resolvedDelegatedBindingSigner }
      : {}),
    ...(gatewayTransform ? { gatewayTransform } : {}),
  });
  const server = await serverFactory({
    app: runtime.app,
    host: runtime.host,
    port: runtime.port,
  });
  const address = server.address();

  writeLog(logger, {
    event: "api_gateway_operational_started",
    host: address.address,
    port: address.port,
    ...runtime.descriptor,
    ...(delegatedBindingDescriptor
      ? { delegatedBinding: delegatedBindingDescriptor }
      : {}),
    ...(trustEvaluationEnabled
      ? {
          trustEvaluation: {
            enabled: true,
            environment: "sandbox",
            provisioning: "operator-only",
            financialEgress : "blocked",
            realMoney: false,
            ...(trustEvaluationPortalEnabled
              ? {
                  portal: {
                    enabled: true,
                    deliveryChannel: "in_product_portal",
                    externalEnvelopeEgress: false,
                  },
                }
              : {}),
          },
        }
      : {}),
  });

  return Object.freeze({ server, runtime });
}

export function registerOperationalShutdown({
  server,
  logger = console,
  processRef = process,
} = {}) {
  if (typeof server?.close !== "function") {
    throw new TypeError("server.close must be a function");
  }

  const shutdown = (signal) => {
    server.close(() => {
      writeLog(logger, {
        event: "api_gateway_operational_stopped",
        signal,
      });
      processRef.exit(0);
    });
  };

  processRef.once("SIGINT", shutdown);
  processRef.once("SIGTERM", shutdown);

  return shutdown;
}

export async function runOperationalMain({
  env = process.env,
  startGateway = startOperationalGateway,
  bootstrapRunner = runUniCoPreviewBootstrap,
  shutdownRegistrar = registerOperationalShutdown,
} = {}) {
  const { server, runtime } = await startGateway({ env });
  await bootstrapRunner({ app: runtime.app, env });
  shutdownRegistrar({ server });
  return Object.freeze({ server, runtime });
}

async function main() {
  await runOperationalMain();
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        event: "api_gateway_operational_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
