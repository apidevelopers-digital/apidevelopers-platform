import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startOperationalHttpServer } from "./operational-http-transport.mjs";
import { createOperationalRuntime } from "./operational-runtime.mjs";
import {
  isDirectExecution,
  registerOperationalShutdown,
  startOperationalGateway,
} from "./operational-server.mjs";
import { createOperatorSecretHandoffOperationalComposition } from "./operator-secret-handoff-operational-composition.mjs";
import { runUniCoPreviewBootstrap } from "./uni-co-preview-bootstrap.mjs";

function configured(value) {
  return Boolean(String(value ?? "").trim());
}

function createCapturingRuntimeFactory({
  runtimeFactory,
  captureSecurity,
} = {}) {
  if (typeof runtimeFactory !== "function") {
    throw new TypeError("runtimeFactory must be a function");
  }
  if (typeof captureSecurity !== "function") {
    throw new TypeError("captureSecurity must be a function");
  }

  return (options = {}) => {
    const downstreamTransform = options.gatewayTransform;
    return runtimeFactory({
      ...options,
      gatewayTransform(context = {}) {
        const gateway = context.gateway;
        captureSecurity({
          authenticator: gateway?.authenticator,
          authorization: gateway?.authorization,
        });
        return typeof downstreamTransform === "function"
          ? downstreamTransform(context)
          : gateway;
      },
    });
  };
}

export async function startOperationalGatewayWithSecretHandoff({
  env = process.env,
  cwd = process.cwd(),
  logger = console,
  gatewayStarter = startOperationalGateway,
  runtimeFactory = createOperationalRuntime,
  serverFactory = startOperationalHttpServer,
  compositionFactory = createOperatorSecretHandoffOperationalComposition,
} = {}) {
  if (typeof gatewayStarter !== "function") {
    throw new TypeError("gatewayStarter must be a function");
  }
  if (typeof serverFactory !== "function") {
    throw new TypeError("serverFactory must be a function");
  }
  if (typeof compositionFactory !== "function") {
    throw new TypeError("compositionFactory must be a function");
  }

  let security = Object.freeze({});
  let handoffComposition;

  const capturingRuntimeFactory = createCapturingRuntimeFactory({
    runtimeFactory,
    captureSecurity(value) {
      security = Object.freeze({ ...value });
    },
  });

  const composingServerFactory = async (options = {}) => {
    handoffComposition = compositionFactory({
      app: options.app,
      authenticator: security.authenticator,
      authorization: security.authorization,
      runtimeDescriptor: Object.freeze({
        adminKeyConfigured: configured(env.API_GATEWAY_ADMIN_KEY),
      }),
      env,
    });

    return serverFactory({
      ...options,
      ...(handoffComposition.enabled
        ? { secretHandoffHttpApp: handoffComposition.httpApp }
        : {}),
    });
  };

  const started = await gatewayStarter({
    env,
    cwd,
    logger,
    runtimeFactory: capturingRuntimeFactory,
    serverFactory: composingServerFactory,
  });

  if (!handoffComposition) {
    throw new TypeError("secret handoff composition was not evaluated");
  }

  return Object.freeze({
    ...started,
    secretHandoff: handoffComposition,
  });
}

export async function runOperationalSecretHandoffMain({
  env = process.env,
  startGateway = startOperationalGatewayWithSecretHandoff,
  bootstrapRunner = runUniCoPreviewBootstrap,
  shutdownRegistrar = registerOperationalShutdown,
} = {}) {
  const started = await startGateway({ env });
  await bootstrapRunner({ app: started.runtime.app, env });
  shutdownRegistrar({ server: started.server });
  return started;
}

async function main() {
  await runOperationalSecretHandoffMain();
}

if (isDirectExecution({
  moduleUrl: import.meta.url,
  argvPath: process.argv[1],
})) {
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
