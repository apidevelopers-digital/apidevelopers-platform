import {
  registerOperationalShutdown,
  startOperationalGateway,
} from "./operational-server-runtime.mjs";

const { server } = await startOperationalGateway();

registerOperationalShutdown({ server });
