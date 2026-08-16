import { registerOperationalShutdown } from "./operational-server.mjs";
import { resolveHostingerRuntimeEnv } from "./hostinger-runtime-env.mjs";
import { startWebAgentOperationalGateway } from "./web-agent-operational-startup.mjs";

// Preserve the managed-hosting entry contract while routing startup through Web Agent composition.
const env = resolveHostingerRuntimeEnv(process.env);
const { server } = await startWebAgentOperationalGateway({ env });

registerOperationalShutdown({ server });
