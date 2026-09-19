import { createZuniChannelBindingWriteComposition } from "./zuni-channel-binding-write-composition.mjs";

export const ZUNI_CHANNEL_BINDING_WRITE_API_ENABLED_ENV =
  "ZUNI_CHANNEL_BINDING_WRITE_API_ENABLED";
export const ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION_ENV =
  "ZUNI_SAAS_CHANNEL_BINDING_WRITE_AUTHORIZATION";

const text = (value) => String(value ?? "").trim();
const enabled = (value) => text(value).toLowerCase() === "true";

export function attachZuniChannelBindingWriteHostingerComposition({
  gateway,
  env = process.env,
  compositionFactory = createZuniChannelBindingWriteComposition,
} = {}) {
  if (typeof gateway?.app?.handleRequest !== "function") {
    throw new TypeError("gateway.app.handleRequest is required");
  }

  const writeEnabled = enabled(env?.[ZUNI_CHANNEL_BINDING_WRITE_API_ENABLED_ENV]);
  if (!writeEnabled) {
    return Object.freeze({
      ...gateway,
      zuniChannelBindingWrite: Object.freeze({
        enabled: false,
        runtimeAutoWiring: true,
        productionChanged: false,
        secretsReturned: false,
      }),
    });
  }

  if (
    !gateway.store ||
    typeof gateway.store.read !== "function" ||
    typeof gateway.store.transaction !== "function"
  ) {
    throw new TypeError("gateway.store must provide read and transaction");
  }

  const consumerAuthorization = text(
    env?.[ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION_ENV],
  );
  if (!consumerAuthorization) {
    throw new TypeError(
      `${ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION_ENV} is required when ${ZUNI_CHANNEL_BINDING_WRITE_API_ENABLED_ENV}=true`,
    );
  }
  if (consumerAuthorization.length < 32) {
    throw new TypeError(
      `${ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION_ENV} must contain at least 32 characters`,
    );
  }

  const composition = compositionFactory({
    app: gateway.app,
    store: gateway.store,
    consumerAuthorization,
    enabled: true,
  });
  if (composition?.enabled !== true || typeof composition?.app?.handleRequest !== "function") {
    throw new TypeError("configured Zuni Channel Binding write composition is unavailable");
  }

  return Object.freeze({
    ...gateway,
    app: composition.app,
    zuniChannelBindingWrite: Object.freeze({
      enabled: true,
      runtimeAutoWiring: true,
      path: composition.descriptor?.path ?? "/v1/zuni/channel-bindings/register",
      productionChanged: false,
      secretsReturned: false,
      consumerConfigured: true,
    }),
  });
}
