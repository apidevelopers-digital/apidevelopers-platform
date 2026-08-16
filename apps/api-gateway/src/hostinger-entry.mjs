import {
  registerOperationalShutdown,
  startOperationalGateway,
} from "./operational-server.mjs";

const { server } = await startOperationalGateway();

registerOperationalShutdown({ server });
