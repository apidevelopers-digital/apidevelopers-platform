import { TrustFaceAccessError } from "./trust-face-access-passkeys.mjs";

export function createTrustFaceAccessHttpRoutes({ trustFaceAccess } = {}) {
  function unavailable() {
    return {
      status: 503,
      payload: {
        error: "trust_face_access_unavailable",
      },
    };
  }

  function verifyUnavailable() {
    return {
      status: 503,
      payload: {
        error: "trust_face_access_verify_unavailable",
      },
    };
  }

  function parsePayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TrustFaceAccessError("json_object_payload_required");
    }
    return payload;
  }

  return Object.freeze({
    registerVerify(payload) {
      if (!trustFaceAccess) return unavailable();
      if (typeof trustFaceAccess?verifyRegistrationPreview !== "function") return verifyUnavailable();

      const parsed = parsePayload(payload);
      const result = trustFaceAccess.verifyRegistrationPreview({
        userId: parsed.userId,
        challenge: parsed.challenge,
        credentialId: parsed.credentialId,
        transports: parsed.transports,
      });

      return {
        status: 200,
        payload: result,
      };
    },

    authenticateVerify(payload) {
      if (!trustFaceAccess) return unavailable();
      if (typeof trustFaceAccess.verifyAuthenticationPreview !== "function") return verifyUnavailable();

      const parsed = parsePayload(payload);
      const result = trustFaceAccess.verifyAuthenticationPreview({
        userId: parsed.userId,
        challenge: parsed.challenge,
        credentialId: parsed.credentialId,
      });

      return {
        status: 200,
        payload: result,
      };
    },
  });
}
