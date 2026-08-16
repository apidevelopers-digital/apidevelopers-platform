import {
  registerOperationalShutdown,
  startOperationalGateway,
} from "./operational-server-runtime.mjs";
import { resolveHostingerRuntimeEnv } from "./hostinger-runtime-env.mjs";

const env = resolveHostingerRuntimeEnv(process.env);
const { server } = await startOperationalGateway({ env });

registerOperationalShutdown({ server });
