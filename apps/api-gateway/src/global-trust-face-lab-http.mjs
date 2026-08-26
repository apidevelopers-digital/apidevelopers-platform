const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});

const PREFIX = "/v1/trust/evaluation/portal/face-lab";

function reply(status, payload) {
  return Object.freeze({ status, headers: JSON_HEADERS, body: JSON.stringify(payload) });
}

function parseBody(body) {
  if (typeof body !== "string" || !body.trim()) {
    const error = new Error("request body must be JSON");
    error.code = "TRUST_FACE_LAB_INVALID_JSON";
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(body); } catch {
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

function previewBase(session) {
  return Object.freeze({
    version: "trust-face-lab/v1",
    mode: "dry-run",
    environment: "sandbox",
    provider: "aws-rekognition",
    region: "sa-east-1",
    session: safeSession(session),
    controls: Object.freeze({
      liveCallsEnabled: false,
      credentialsAllowed: false,
      productionEnabled: false,
      biometricMaterialAccepted: false,
      auditImagesLimit: 0,
    }),
  });
}

function knownFailure(error) {
  const map = {
    TRUST_FACE_LAB_INVALID_JSON: [400, "invalid_json"],
    TRUST_FACE_LAB_INVALID_INPUT: [400, "invalid_input"],
    TRUST_FACE_LAB_INVALID_REFERENCE: [400, "opaque_reference_required"],
    TRUST_FACE_LAB_UNAUTHORIZED: [401, "unauthorized"],
    TRUST_EVALUATION_PORTAL_SESSION_INVALID_TOKEN: [401, "unauthorized"],
    TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED: [401, "unauthorized"],
  };
  return map[error?.code] ?? null;
}

export function createGlobalTrustFaceLabHttpHandler({ portalSession } = {}) {
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
        const base = previewBase(session);

        if (normalizedMethod === "GET" && pathname === `${PREFIX}/status`) {
          return reply(200, {
            allowed: true,
            faceLab: Object.freeze({
              ...base,
              status: "preview-ready",
              capabilities: Object.freeze(["liveness_preview", "compare_faces_preview"]),
              nextLiveDependency: "aws_provider_execution_authorization",
            }),
          });
        }

        if (normalizedMethod === "POST" && pathname === `${PREFIX}/liveness/preview`) {
          const payload = parseBody(body);
          const verificationId = requireText(payload.verificationId, "verificationId");
          return reply(200, {
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

        if (normalizedMethod === "POST" && pathname === `${PREFIX}/compare/preview`) {
          const payload = parseBody(body);
          const verificationId = requireText(payload.verificationId, "verificationId");
          const sourceReferenceRef = requireOpaqueRef(payload.sourceReferenceRef, "sourceReferenceRef");
          const targetReferenceRef = requireOpaqueRef(payload.targetReferenceRef, "targetReferenceRef");
          return reply(200, {
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

        return reply(404, { allowed: false, reason: "face_lab_route_not_found" });
      } catch (error) {
        const failure = knownFailure(error);
        if (!failure) throw error;
        return reply(failure[0], { allowed: false, reason: failure[1] });
      }
    },
  });
}
