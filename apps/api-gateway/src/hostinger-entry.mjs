import { registerOperationalShutdown } from "./operational-server.mjs";
import { startWebAgentOperationalGateway } from "./web-agent-operational-startup.mjs";

// Preserve the managed-hosting entry contract while routing startup through Web Agent composition.
const startOperationalGateway = startWebAgentOperationalGateway;
const { server } = await startOperationalGateway();

registerOperationalShutdown({ server });
