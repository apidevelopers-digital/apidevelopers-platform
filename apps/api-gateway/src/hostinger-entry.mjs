import { registerOperationalShutdown } from "./operational-server.mjs";
import { resolveHostingerRuntimeEnv } from "./hostinger-runtime-env.mjs";
import { startWebAgentOperationalGateway } from "./web-agent-operational-startup.mjs";

// Preserve the managed-hosting startup contract while routing the implementation
// through the Web Agent operational composition.
async function startOperationalGateway(options = {}) {
  return startWebAgentOperationalGateway(options);
}

const env = resolveHostingerRuntimeEnv(process.env);
const { server } = await startOperationalGateway({ env });

registerOperationalShutdown({ server });
