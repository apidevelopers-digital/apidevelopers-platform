import { pathToFileURL } from "node:url";

import { createApp, startServer } from "./server.mjs";
import { createPluginAwareApp } from "./plugin-aware-app.mjs";

export function createPluginsApp(options = {}) {
  return createPluginAwareApp({
    app: createApp(options),
  });
}

export async function startPluginsServer(options = {}) {
  const { app, ...appOptions } = options;
  const wrappedApp = app ?? createPluginsApp(appOptions);

  return startServer({
    ...appOptions,
    app: wrappedApp,
  });
}

async function main() {
  const server = await startPluginsServer();
  const address = server.address();

  console.log(JSON.stringify({
    event: "api_gateway_plugins_started",
    host: address.address,
    port: address.port,
  }));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(JSON.stringify({
      event: "api_gateway_plugins_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    process.exitCode = 1;
  });
}
