import { secureCompareSecrets } from "@apidevelopers/auth-core";
import {
  createSaasRuntime,
  createZuniChannelBindingRuntime,
} from "@apidevelopers/saas-runtime";

export const zuniChannelBindingReadonlyPath =
  "/v1/zuni/channel-bindings/resolve";
export const ZUNI_CHANNEL_BINDING_READONLY_CONSUMER_PRINCIPAL_ID =
  "server.zuni-channel-binding-reader";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
});

function response(status, payload) {
  return Object.freeze({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function readHeader(headers, name) {
  const target = String(name).toLowerCase();
  const entry = Object.entries(headers ?? {}).find(
    ([key]) => String(key).toLowerCase() === target,
  );
  const value = entry?.[1];
  return Array.isArray(value) ? value.join(", ") : value;
}

function parseBody(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) {
    throw Object.assign(new Error("invalid_json"), { status: 400 });
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw 0;
    return parsed;
  } catch {
    throw Object.assign(new Error("invalid_json"), { status: 400 });
  }
}

function sanitizeBinding(binding = {}) {
  return Object.freeze({
    bindingId: optionalText(binding.bindingId) ?? null,
    tenantId: optionalText(binding.tenantId) ?? null,
    workspaceId: optionalText(binding.workspaceId) ?? null,
    productId: optionalText(binding.productId) ?? null,
    provider: optionalText(binding.provider) ?? null,
    channelType: optionalText(binding.channelType) ?? null,
    channelId: optionalText(binding.channelId) ?? null,
    wabaId: optionalText(binding.wabaId) ?? null,
    phoneNumberId: optionalText(binding.phoneNumberId) ?? null,
    credentialRef: optionalText(binding.credentialRef) ?? null,
    status: optionalText(binding.status) ?? null,
    createdAt: optionalText(binding.createdAt) ?? null,
    updatedAt: optionalText(binding.updatedAt) ?? null,
  });
}

export function createZuniChannelBindingReadonlyConsumerAuthenticator({
  authorization,
  compareSecrets = secureCompareSecrets,
} = {}) {
  const expected = optionalText(authorization);
  if (!expected) {
    return Object.freeze({
      configured: false,
      async authenticate() {
        return null;
      },
    });
  }
  if (expected.length < 32) {
    throw new TypeError(
      "zuni channel binding readonly authorization must contain at least 32 characters",
    );
  }
  if (typeof compareSecrets !== "function") {
    throw new TypeError("compareSecrets must be a function");
  }

  return Object.freeze({
    configured: true,
    async authenticate(headers = {}) {
      const provided = optionalText(readHeader(headers, "authorization"));
      if (!provided || !compareSecrets(provided, expected)) return null;
      return Object.freeze({
        role: "server",
        principal: Object.freeze({
          id: ZUNI_CHANNEL_BINDING_READONLY_CONSUMER_PRINCIPAL_ID,
          name: "Zuni Channel Binding Reader",
          status: "active",
          scopes: Object.freeze(["zuni:channel-bindings:read"]),
        }),
      });
    },
  });
}

export function createZuniChannelBindingReadonlyComposition({
  app,
  store,
  consumerAuthorization,
  enabled = false,
  compareSecrets = secureCompareSecrets,
  saasRuntimeFactory = createSaasRuntime,
  channelRuntimeFactory = createZuniChannelBindingRuntime,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }

  const disabled = () =>
    Object.freeze({
      enabled: false,
      app,
      descriptor: Object.freeze({
        mode: "server-to-server",
        path: zuniChannelBindingReadonlyPath,
        readOnly: true,
        writesEnabled: false,
        productionChanged: false,
        secretsReturned: false,
        credentialRefsReturned: true,
        consumerConfigured: false,
      }),
    });

  if (enabled !== true) return disabled();
  if (
    !store ||
    typeof store.read !== "function" ||
    typeof store.transaction !== "function"
  ) {
    throw new TypeError("store must provide read and transaction");
  }
  if (typeof saasRuntimeFactory !== "function") {
    throw new TypeError("saasRuntimeFactory must be a function");
  }
  if (typeof channelRuntimeFactory !== "function") {
    throw new TypeError("channelRuntimeFactory must be a function");
  }

  const consumerAuthenticator =
    createZuniChannelBindingReadonlyConsumerAuthenticator({
      authorization: consumerAuthorization,
      compareSecrets,
    });
  if (consumerAuthenticator.configured !== true) return disabled();

  const saasRuntime = saasRuntimeFactory({ store });
  const channelRuntime = channelRuntimeFactory({ store, saasRuntime });
  if (typeof channelRuntime?.listChannelBindings !== "function") {
    throw new TypeError("channelRuntime.listChannelBindings is required");
  }

  const composedApp = Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const path = new URL(
        String(request.url ?? "/"),
        "http://api-gateway.local",
      ).pathname;

      if (method !== "POST" || path !== zuniChannelBindingReadonlyPath) {
        return app.handleRequest(request);
      }

      try {
        const auth = await consumerAuthenticator.authenticate(
          request.headers ?? {},
        );
        const principalId = optionalText(auth?.principal?.id);
        if (
          !auth ||
          auth.role !== "server" ||
          principalId !== ZUNI_CHANNEL_BINDING_READONLY_CONSUMER_PRINCIPAL_ID
        ) {
          return response(401, {
            ok: false,
            resolved: false,
            error: "zuni_channel_binding_reader_unauthorized",
          });
        }

        const payload = parseBody(request.body);
        const keys = Object.keys(payload);
        if (keys.some((key) => !["tenantId", "workspaceId"].includes(key))) {
          return response(400, {
            ok: false,
            resolved: false,
            error: "zuni_channel_binding_read_payload_invalid",
          });
        }

        const tenantId = optionalText(payload.tenantId);
        const workspaceId = optionalText(payload.workspaceId);
        if (!tenantId || !workspaceId) {
          return response(400, {
            ok: false,
            resolved: false,
            error: "zuni_channel_binding_scope_required",
          });
        }

        const rows = await channelRuntime.listChannelBindings({
          tenantId,
          workspaceId,
          status: "active",
        });
        const bindings = Object.freeze(
          (Array.isArray(rows) ? rows : []).map(sanitizeBinding),
        );

        return response(200, {
          ok: true,
          resolved: bindings.length > 0,
          count: bindings.length,
          bindings,
          readOnly: true,
          writesExecuted: false,
          secretsReturned: false,
        });
      } catch (error) {
        const status =
          error?.status === 400 || error?.status === 401 ? error.status : 503;
        return response(status, {
          ok: false,
          resolved: false,
          error:
            status === 400
              ? "invalid_json"
              : status === 401
                ? "zuni_channel_binding_reader_unauthorized"
                : "zuni_channel_binding_read_unavailable",
          readOnly: true,
          writesExecuted: false,
          secretsReturned: false,
        });
      }
    },
  });

  return Object.freeze({
    enabled: true,
    app: composedApp,
    channelRuntime,
    consumerAuthenticator,
    descriptor: Object.freeze({
      mode: "server-to-server",
      path: zuniChannelBindingReadonlyPath,
      readOnly: true,
      writesEnabled: false,
      productionChanged: false,
      secretsReturned: false,
      credentialRefsReturned: true,
      consumerConfigured: true,
      consumerPrincipalId: ZUNI_CHANNEL_BINDING_READONLY_CONSUMER_PRINCIPAL_ID,
      runtimeAutoWiring: false,
    }),
  });
}
