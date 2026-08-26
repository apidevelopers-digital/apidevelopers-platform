const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});

const PREFIX = "/v1/trust/evaluation/portal/face-lab";
const FACE_LAB_VERSION = "trust-face-lab/v2";
const PROVIDER = "aws-rekognition";
const REGION = "sa-east-1";
const LIVE_APPROVAL = "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL";

function reply(status, payload) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      ...JSON_HEADERS,
      "x-trust-face-lab": FACE_LAB_VERSION,
    }),
    body: JSON.stringify(payload),
  });
}

function parseBody(body) {
  if (typeof body !== "string" || !body.trim()) {
    const error = new Error("request body must be JSON");
    error.code = "TRUST_FACE_LAB_INVALID_JSON";
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    const error = new Error("request body must be valid JSON");
    error.code = "TRUST_FACE_LAB_INVALID_JSON";
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("request body must be a JSON object");
    error.code = "TRUST_FACE_LAB_INVALID_JSON";
    throw error;
  }
  return parsed;
}

function bearerToken(headers = {}) {
  const value = headers.authorization ?? headers.Authorization;
  const raw = Array.isArray(value) ? value[0] : value;
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(String(raw ?? "").trim());
  if (!match) {
    const error = new Error("portal bearer token required");
    error.code = "TRUST_FACE_LAB_UNAUTHORIZED";
    throw error;
  }
  return match[1];
}

function requireText(value, name, max = 120) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max) {
    const error = new Error(`${name} is required`);
    error.code = "TRUST_FACE_LAB_INVALID_INPUT";
    throw error;
  }
  return normalized;
}

function requireOpaqueRef(value, name) {
  const normalized = requireText(value, name, 184);
  if (!/^ref:[A-Za-z0-9._/-]{1,180}$/.test(normalized)) {
    const error = new Error(`${name} must be an opaque ref`);
    error.code = "TRUST_FACE_LAB_INVALID_REFERENCE";
    throw error;
  }
  return normalized;
}

function safeSession(session) {
  return Object.freeze({
    sessionId: session.sessionId,
    organizationId: session.organizationId,
    enrollmentId: session.enrollmentId,
    scopes: Object.freeze([...(session.scopes ?? [])]),
  });
}

function liveFlags(env) {
  return Object.freeze({
    liveCallsEnabled: String(env?.TRUST_AWS_LIVE_CALLS_ENABLED ?? "") === "true",
    credentialsAllowed: String(env?.TRUST_AWS_CREDENTIALS_ALLOWED ?? "") === "true",
    sandboxApproved: String(env?.TRUST_AWS_SANDBOX_APPROVAL ?? "") === LIVE_APPROVAL,
  });
}

function liveAvailable(liveRuntime, env) {
  const flags = liveFlags(env);
  return Boolean(liveRuntime) && flags.liveCallsEnabled && flags.credentialsAllowed && flags.sandboxApproved;
}

function basePayload(session, liveRuntime, env) {
  const flags = liveFlags(env);
  return Object.freeze({
    version: FACE_LAB_VERSION,
    mode: "dry-run",
    environment: "sandbox",
    provider: PROVIDER,
    region: REGION,
    session: safeSession(session),
    controls: Object.freeze({
      liveRuntimeWired: Boolean(liveRuntime),
      liveCallsEnabled: flags.liveCallsEnabled,
      credentialsAllowed: flags.credentialsAllowed,
      sandboxApproved: flags.sandboxApproved,
      liveAvailable: liveAvailable(liveRuntime, env),
      productionEnabled: false,
      biometricMaterialAccepted: false,
      auditImagesLimit: 0,
    }),
  });
}

function previewLiveness(base, payload) {
  const verificationId = requireText(payload.verificationId, "verificationId");
  return Object.freeze({
    allowed: true,
    preview: Object.freeze({
      ...base,
      verificationId,
      operation: "CreateFaceLivenessSession",
      clientAction: "StartFaceLivenessSession",
      resultAction: "GetFaceLivenessSessionResults",
      sessionTtlSeconds: 180,
      rawBiometricMaterialForwarded: false,
      rawBiometricMaterialPersisted: false,
      governedDecisionProduced: false,
    }),
  });
}

function previewCompare(base, payload) {
  const verificationId = requireText(payload.verificationId, "verificationId");
  const sourceReferenceRef = requireOpaqueRef(payload.sourceReferenceRef, "sourceReferenceRef");
  const targetReferenceRef = requireOpaqueRef(payload.targetReferenceRef, "targetReferenceRef");
  return Object.freeze({
    allowed: true,
    preview: Object.freeze({
      ...base,
      verificationId,
      sourceReferenceRef,
      targetReferenceRef,
      operation: "CompareFaces",
      similarityThreshold: 0,
      qualityFilter: "NONE",
      providerScoreIsSignalOnly: true,
      governedDecisionProduced: false,
      rawBiometricMaterialForwarded: false,
      rawBiometricMaterialPersisted: false,
    }),
  });
}

function requireLiveRuntime(liveRuntime, env) {
  if (!liveAvailable(liveRuntime, env)) {
    const error = new Error("face lab live runtime is not available");
    error.code = "TRUST_FACE_LAB_LIVE_NOT_AVAILABLE";
    throw error;
  }
  return liveRuntime;
}

function requireS3Ref(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(valu)) {
    const error = new Error(`${name} is required`);
    error.code = "TRUST_FACE_LAB_INVALID_INPUT";
    throw error;
  }
  if (Object.hasOwn(value, "Bytes")) {
    const error = new Error(${name}.Bytes is forbidden`);
    error.code = "TRUST_FACE_LAB_RAW_BIOMETRIC_FORBIDDEN";
    throw error;
  }
  const ref = {
    Bucket: requireText(value.Bucket, `${name}.Bucket`, 255),
    Name: requireText(value.Name, ${name}.Name`, 1024),
  };
  if (value.Version != null) ref.Version = requireText(value.Version, `${name}.Version`, 1024);
  return Object.freeze(ref);
}

function knownFailure(error) {
  const map = {
    TRUST_FACE_LAB_INVALID_JSON: [400, "invalid_json"],
    TRUST_FACE_LAB_INVALID_INPUT: [400, "invalid_input"],
    TRUST_FACE_LAB_INVALID_REFERENCE: [400, "opaque_reference_required"],
    TRUST_FACE_LAB_RAW_BIOMETRIC_FORBIDDEN: [400, "raw_biometric_material_forbidden"],
    TRUST_FACE_LAB_UNAUTHORIZED: [401, "unauthorized"],
    TRUST_EVALUATION_PORTAL_SESSION_INVALID_TOKEN: [401, "unauthorized"],
    TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED: [401, "unauthorized"],
    TRUST_FACE_LAB_LIVE_NOT_AVAILABLE: [503, "face_lab_live_not_available"],
  };
  if (map[error?.code]) return map[error.code];
  if (typeof error?.code === "string" && (
    error.code.startsWith("invalid_")
    || error.code.startsWith("s3_")
    || error.code.startsWith("raw_")
    || error.code.startsWith("multiple_")
    || error.code.startsWith("reference_")
    || error.code.startsWith("session_")
    || error.code.startsWith("live_")
    || error.code.startsWith("credentials_")
    || error.code.startsWith("sandbox_")
    || error.code.startsWith("region_")
  )) {
    return [400, error.code];
  }
  return null;
}

export function createGlobalTrustFaceLabHttpHandler({
  portalSession,
  liveRuntime = null,
  env = process.env,
} = {}) {
  if (typeof portalSession?.authenticate !== "function") {
    throw new TypeError("portalSession.authenticate must be a function");
  }

  return Object.freeze({
    async handleRequest({ method = "GET", url = "/", headers = {}, body } = {}) {
      const requestUrl = new URL(String(url), "http://api-gateway.local");
      const pathname = requestUrl.pathname;
      if (!pathname.startsWith(`${PREFIX}/`) && pathname !== PREFIX) return null;
      const normalizedMethod = String(method).toUpperCase();

      try {
        const session = await portalSession.authenticate({ token: bearerToken(headers) });
        const base = basePayload(session, liveRuntime, env);

        if (normalizedMethod === "GET" && pathname === `${PREFIX}/status`) {
          return reply(200, {
            allowed: true,
            faceLab: Object.freeze({
              ...base,
              status: liveAvailable(liveRuntime, env) ? "live-ready" : "preview-ready",
              capabilities: Object.freeze(["liveness_preview", "compare_faces_preview", "liveness_live", "compare_faces_live"]),
              nextLiveDependency: liveAvailable(liveRuntime, env) ? null : "aws_provider_execution_authorization",
            }),
          });
        }

        if (normalizedMethod === "POST" && pathname === `${PREFIX}/liveness/preview`) {
          return reply(200, previewLiveness(base, parseBody(body)));
        }

        if (normalizedMethod === "POST" && pathname === `${PREFIX}/compare/preview`) {
          return reply(200, previewCompare(base, parseBody(body)));
        }

        if (normalizedMethod === "POST" && pathname === `${PREFIX}/liveness/session`) {
          const payload = parseBody(body);
          const runtime = requireLiveRuntime(liveRuntime, env);
          const result = await runtime.createLivenessSession({
            clientRequestToken: requireText(payload.clientRequestToken, "clientRequestToken, 64),
            outputConfig: Object.freeze({
              S3Bucket: requireText(payload.outputConfig?.S3Bucket, "outputConfig.S3Bucket", 255),
              S3KeyPrefix: requireText(payload.outputConfig?.S3KeyPrefix, "outputConfig.S3KeyPrefix", 1024),
            }),
          });
          return reply(201, { allowed: true, operation: "face-liveness-session", result });
        }

        if (normalizedMethod === "POST" && pathname === `${PREFIX}/liveness/result`) {
          const payload = parseBody(body);
          const runtime = requireLiveRuntime(liveRuntime, env);
          const result = await runtime.getLivenessResult({ sessionId: requireText(payload.sessionId, "sessionId", 128) });
          return reply(200, { allowed: true, operation: "face-liveness-result", result });
        }

        if (normalizedMethod === "POST" && pathname === `${PREFIX}/compare`) {
          const payload = parseBody(body);
          const runtime = requireLiveRuntime(liveRuntime, env);
          const result = await runtime.compareFaces({
            sourceS3Object: requireS3Ref(payload.sourceS3Object, "sourceS3Object"),
            targetS3Object: requireS3Ref(payload.targetS3Object, "targetS3Object"),
          });
          return reply(200, { allowed: true, operation: "compare-faces", providerSignal: result, trustDecision: null });
        }

        return reply(404, { allowed: false, reason: "face_lab_route_not_found" });
      } catch (error) {
        const failure = knownFailure(error);
        if (!failur) throw error;
        return reply(failur[0], { allowed: false, reason: failure[1] });
      }
    },
  });
}
