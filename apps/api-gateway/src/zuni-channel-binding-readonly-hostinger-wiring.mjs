import { createZuniChannelBindingReadonlyComposition } from "./zuni-channel-binding-readonly-composition.mjs";

export const ZUNI_CHANNEL_BINDING_READONLY_API_ENABLED_ENV =
  "ZUNI_CHANNEL_BINDING_READONLY_API_ENABLED";
export const ZUNI_CHANNEL_BINDING_READ_AUTHORIZATION_ENV =
  "ZUNI_SAAS_CHANNEL_BINDING_READ_AUTHORIZATION";

const text = (value) => String(value ?? "").trim();
const enabled = (value) => text(value).toLowerCase() === "true";

export function attachZuniChannelBindingReadonlyHostingerComposition({
  gateway,
  env = process.env,
  compositionFactory = createZuniChannelBindingReadonlyComposition,
} = {}) {
  if (typeof gateway?.app?.handleRequest !== "function") {
    throw new TypeError("gateway.app.handleRequest is required");
  }

  const readEnabled = enabled(env?.[ZUNI_CHANNEL_BINDING_READONLY_API_ENABLED_ENV]);
  if (!readEnabled) {
    return Object.freeze({
      ...gateway,
      zuniChannelBindingReadonly: Object.freeze({
        enabled: false,
        runtimeAutoWiring: true,
        readOnly: true,
        writesEnabled: false,
        productionChanged: false,
        secretsReturned: false,
      }),
    });
  }

  if (
    !gateway.store ||
    typeof gateway.store.read !== "function" ||
    typeof gateway.store.transaction !== "function" ||
    typeof gateway.store.executeIdempotent !== "function"
  ) {
    throw new TypeError(
      "gateway.store must provide read, transaction, and executeIdempotent",
    );
  }

  const consumerAuthorization = text(
    env?.[ZUNI_CHANNEL_BINDING_READ_AUTHORIZATION_ENV],
  );
  if (!consumerAuthorization) {
    throw new TypeError(
      `${ZUNI_CHANNEL_BINDING_READ_AUTHORIZATION_ENV} is required when ${ZUNI_CHANNEL_BINDING_READONLY_API_ENABLED_ENV}=true`,
    );
  }
  if (consumerAuthorization.length < 32) {
    throw new TypeError(
      `${ZUNI_CHANNEL_BINDING_READ_AUTHORIZATION_ENV} must contain at least 32 characters`,
    );
  }

  const composition = compositionFactory({
    app: gateway.app,
    store: gateway.store,
    consumerAuthorization,
    enabled: true,
  });
  if (
    composition?.enabled !== true ||
    typeof composition?.app?.handleRequest !== "function"
  ) {
    throw new TypeError(
      "configured Zuni Channel Binding readonly composition is unavailable",
    );
  }

  return Object.freeze({
    ...gateway,
    app: composition.app,
    zuniChannelBindingReadonly: Object.freeze({
      enabled: true,
      runtimeAutoWiring: true,
      path:
        composition.descriptor?.path ??
        "/v1/zuni/channel-bindings/resolve",
      readOnly: true,
      writesEnabled: false,
      productionChanged: false,
      secretsReturned: false,
      consumerConfigured: true,
    }),
  });
}
