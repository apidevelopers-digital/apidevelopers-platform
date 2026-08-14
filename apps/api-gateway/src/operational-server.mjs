import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startOperationalHttpServer } from "./operational-http-transport.mjs";
import { createOperationalRuntime } from "./operational-runtime.mjs";

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
  trustEvaluationLoader = () =>
    import("./operational-trust-evaluation-composition.mjs"),
} = {}) {
  if (typeof runtimeFactory !== "function") {
    throw new TypeError("runtimeFactory must be a function");
  }
  if (typeof serverFactory !== "function") {
    throw new TypeError("serverFactory must be a function");
  }

  const trustEvaluationEnabled = resolveTrustEvaluationEnabled(env);
  let gatewayTransform;

  if (trustEvaluationEnabled) {
    if (typeof trustEvaluationLoader !== "function") {
      throw new TypeError("trustEvaluationLoader must be a function");
    }

    const module = await trustEvaluationLoader();
    const attach = module?.attachOperationalTrustEvaluationGateway;
    if (typeof attach !== "function") {
      throw new TypeError(
        "Trust Evaluation module must export attachOperationalTrustEvaluationGateway",
      );
    }

    gatewayTransform = ({ gateway }) => attach({ gateway });
  }

  const runtime = runtimeFactory({
    env,
    cwd,
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
    ...(trustEvaluationEnabled
      ? {
          trustEvaluation: {
            enabled: true,
            environment: "sandbox",
            provisioning: "operator-only",
            financialEgress: "blocked",
            realMoney: false,
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

async function main() {
  const { server } = await startOperationalGateway();
  registerOperationalShutdown({ server });
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
