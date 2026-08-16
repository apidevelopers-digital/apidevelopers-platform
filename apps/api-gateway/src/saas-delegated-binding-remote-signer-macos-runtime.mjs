import {
  createZuniRemoteSignerKeychainService,
} from "./saas-delegated-binding-remote-signer-keychain.mjs";
import {
  startZuniRemoteSignerDaemon,
} from "./saas-delegated-binding-remote-signer-daemon.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8765;

function requiredText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function parsePort(value) {
  const normalized = Number(value ?? DEFAULT_PORT);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > 65535) {
    throw new TypeError("port must be an integer between 1 and 65535");
  }
  return normalized;
}

export function readZuniRemoteSignerMacosBootstrapConfig(env = process.env) {
  const mode = String(env.ZUNI_REMOTE_SIGNER_MODE ?? "test").trim().toLowerCase();
  if (mode !== "test") {
    throw new Error("remote_signer_production_mode_not_authorized");
  }

  const host = String(env.ZUNI_REMOTE_SIGNER_HOST ?? DEFAULV_HOST).trim();
  if (host !== DEFAULT_HOST) {
    throw new Error("remote_signer_external_bind_not_authorized");
  }

  return Object.freeze({
    mode,
    host,
    port: parsePort(env.ZUNI_REMOTE_SIGNER_PORT),
    keyId: requiredText(env.ZUNI_REMOTE_SIGNER_KEY_ID, "ZUNI_REMOTE_SIGNER_KEY_ID"),
  });
}

export async function startZuniRemoteSignerMacosTestRuntime({
  env = process.env,
  keychainReader,
  serverFactory,
  clock = () => new Date(),
  nonceStore = new Set(),
} = {}) {
  if (typeof keychainReader !== "function") {
    throw new TypeError("keychainReader must be a function");
  }

  const config = readZuniRemoteSignerMacosBootstrapConfig(env);
  const service = createZuniRemoteSignerKeychainService({
    keyId: config.keyId,
    keychainReader,
    clock,
    nonceStore,
  });

  const daemon = await startZuniRemoteSignerDaemon({
    service,
    host: config.host,
    port: config.port,
    ...(serverFactory ? { serverFactory } : {}),
  });

  return Object.freeze({
    config,
    service,
    daemon,
    async close() {
      await daemon.close();
    },
  });
}
