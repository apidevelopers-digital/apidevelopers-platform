/*
 * Instagram Scheduler Backend Bridge
 *
 * Safe internal bridge for Hostinger Cron -> API Gateway -> Meta Graph.
 * This module contains no secrets. It reads secrets only from runtime env:
 *
 * - META_SYSTEM_USER_ACCESS_TOKEN for Meta Graph publishing
 * - INSTAGRAM_SCHEDULER_BRIDGE_SECRET for cron -> gateway authorization
 *
 * Safety guarantees:
 * - publishes only STORIES;
 * - no feed, no deletes, no ads;
 * - real publish requires explicit execution approval in the request body;
 * - tokens are never returned or logged.
 */

import { publishStoryItem } from "./instagram-stories-scheduler-publisher.mjs";

const EXECUTION_CONFIRMATION = "IGOR_APROVA_HOSTINGER_INSTAGRAM_SCHEDULER_REAL";

export class InstagramSchedulerBridgeError extends Error {
  constructor(code, message, details = {}) {
    super(message ?? code);
    this.name = "InstagramSchedulerBridgeError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function safeError(error) {
  if (error instanceof InstagramSchedulerBridgeError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  return {
    code: "unknown_error",
    message: error instanceof Error ? error.message : String(error),
  };
}

function assertBody(name, value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new InstagramSchedulerBridgeError(`bridge_missing_${name}`, `Missing ${name}`);
  }
  return String(value).trim();
}

function readBridgeSecret(headers = {}) {
  return String(
    headers["x-instagram-scheduler-secret"] ??
      headers["X-Instagram-Scheduler-Secret"] ??
      "",
  ).trim();
}

function resolveAccessToken(env) {
  const token = String(env.META_SYSTEM_USER_ACCESS_TOKEN ?? "").trim();
  if (!token) {
    throw new InstagramSchedulerBridgeError(
      "bridge_missing_meta_system_user_token",
      "META_SYSTEM_USER_ACCESS_TOKEN is not configured",
    );
  }
  return token;
}

function assertAuthorized({ headers, env }) {
  const expected = String(env.INSTAGRAM_SCHEDULER_BRIDGE_SECRET ?? "").trim();
  if (!expected) {
    throw new InstagramSchedulerBridgeError(
      "bridge_secret_not_configured",
      "INSTAGRAM_SCHEDULER_BRIDGE_SECRET is not configured",
    );
  }

  const actual = readBridgeSecret(headers);
  if (!actual || actual !== expected) {
    throw new InstagramSchedulerBridgeError(
      "bridge_unauthorized",
      "Instagram scheduler bridge secret is invalid",
    );
  }
}

function parseBody(body) {
  let payload;
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    throw new InstagramSchedulerBridgeError("bridge_invalid_json_body", "Request body must be valid JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InstagramSchedulerBridgeError("bridge_invalid_payload", "Request payload must be an object");
  }
  return payload;
}

export function createInstagramSchedulerBackendBridge({
  env = process.env,
  fetchImpl = globalThis.fetch,
  graphBaseUrl,
} = {}) {
  return Object.freeze({
    async handleRequest({ method = "GET", pathname = "/", headers = {}, body } = {}) {
      const normalizedMethod = String(method).toUpperCase();

      if (normalizedMethod === "GET" && pathname === "/v1/internal/instagram-scheduler/status") {
        return {
          status: 200,
          payload: {
            service: "instagram-scheduler-bridge",
            status: "ok",
            metaTokenConfigured: Boolean(String(env.META_SYSTEM_USER_ACCESS_TOKEN ?? "").trim()),
            bridgeSecretConfigured: Boolean(String(env.INSTAGRAM_SCHEDULER_BRIDGE_SECRET ?? "").trim()),
            secretsExposed: false,
          },
        };
      }

      if (
        normalizedMethod !== "POST" ||
        pathname !== "/v1/internal/instagram-scheduler/publish-story"
      ) {
        return null;
      }

      assertAuthorized({ headers, env });

      const payload = parseBody(body);
      if (payload.execute !== EXECUTION_CONFIRMATION) {
        throw new InstagramSchedulerBridgeError(
          "bridge_missing_execution_confirmation",
          "Explicit execution confirmation is required",
        );
      }

      const item = {
        instagram: assertBody("instagram", payload.instagram),
        ig_user_id: assertBody("ig_user_id", payload.ig_user_id ?? payload.igUserId),
        url_publica: assertBody("url_publica", payload.url_publica ?? payload.imageUrl),
        action: "story",
        topic: payload.topic ?? payload.tema_ou_arquivo ?? null,
      };

      const result = await publishStoryItem({
        fetchImpl,
        graphBaseUrl,
        accessToken: resolveAccessToken(env),
        item,
        dryRun: false,
      });

      return {
        status: 200,
        payload: {
          ok: true,
          service: "instagram-scheduler-bridge",
          mediaType: "STORIES",
          instagram: result.instagram,
          igUserId: result.igUserId,
          publishedId: result.publishedId,
          creationId: result.creationId,
        },
      };
    },
  });
}

export function toBridgeJsonResponse(result) {
  return {
    status: result.status,
    payload: result.payload,
  };
}

export function bridgeErrorResponse(error) {
  const safe = safeError(error);
  const status =
    safe.code === "bridge_unauthorized" ? 401 :
    safe.code === "bridge_missing_execution_confirmation" ? 403 :
    safe.code === "bridge_invalid_json_body" ? 400 :
    safe.code === "bridge_invalid_payload" ? 400 :
    500;

  return {
    status,
    payload: {
      ok: false,
      ...safe,
      secretsExposed: false,
    },
  };
}
