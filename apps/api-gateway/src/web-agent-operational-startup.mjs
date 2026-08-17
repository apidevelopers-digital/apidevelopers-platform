import { startOperationalGateway } from "./operational-server.mjs";
import { createOperationalRuntime } from "./operational-runtime.mjs";
import { startOperationalHttpServer } from "./operational-http-transport.mjs";
import { createWebAgentOperationalComposition } from "./web-agent-operational-composition.mjs";

export async function startWebAgentOperationalGateway({
  env = process.env,
  cwd = process.cwd(),
  logger = console,
  gatewayStarter = startOperationalGateway,
  runtimeFactory = createOperationalRuntime,
  serverFactory = startOperationalHttpServer,
  webAgentFactory = createWebAgentOperationalComposition,
  ...gatewayOptions
} = {}) {
  if (typeof gatewayStarter !== "function") {
    throw new TypeError("gatewayStarter must be a function");
  }
  if (typeof runtimeFactory !== "function") {
    throw new TypeError("runtimeFactory must be a function");
  }
  if (typeof serverFactory !== "function") {
    throw new TypeError("serverFactory must be a function");
  }
  if (typeof webAgentFactory !== "function") {
    throw new TypeError("webAgentFactory must be a function");
  }

  let capturedRuntime;
  let webAgentDescriptor = Object.freeze({ enabled: false, mode: "shadow" });

  const capturingRuntimeFactory = (options = {}) => {
    capturedRuntime = runtimeFactory(options);
    return capturedRuntime;
  };

  const wrappingServerFactory = async ({ app, host, port } = {}) => {
    if (!capturedRuntime?.store) {
      throw new TypeError("operational runtime store is unavailable");
    }
    const webAgent = webAgentFactory({
      app,
      store: capturedRuntime.store,
      env,
    });
    webAgentDescriptor = webAgent.descriptor;
    return serverFactory({
      app: webAgent.app,
      host,
      port,
    });
  };

  const started = await gatewayStarter({
    ...gatewayOptions,
    env,
    cwd,
    logger,
    runtimeFactory: capturingRuntimeFactory,
    serverFactory: wrappingServerFactory,
  });

  return Object.freeze({
    ...started,
    webAgent: webAgentDescriptor,
  });
}
