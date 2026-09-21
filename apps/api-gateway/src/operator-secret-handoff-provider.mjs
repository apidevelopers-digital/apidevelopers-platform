import {
  normalizeOperatorSecretAccess,
  OperatorSecretContractError,
} from "./operator-secret-provider-contract.mjs";

const REF_PREFIX = "secret://handoff/";

function fail(code, message = code) {
  throw new OperatorSecretContractError(code, message);
}

function sessionIdFromRef(secretRef) {
  if (!secretRef.startsWith(REF_PREFIX)) {
    fail("secret_handoff_ref_unsupported");
  }
  const sessionId = secretRef.slice(REF_PREFIX.length).trim();
  if (!sessionId || !/^[A-Za-z0-9._:-]{3,128}$/.test(sessionId)) {
    fail("secret_handoff_ref_invalid");
  }
  return sessionId;
}

export function createOperatorSecretHandoffProvider({ handoffService } = {}) {
  if (typeof handoffService?.consume !== "function" || typeof handoffService?.status !== "function") {
    throw new TypeError("handoffService must expose consume and status");
  }

  return Object.freeze({
    descriptor: Object.freeze({
      mode: "handoff",
      directSecretAccepted: false,
      secretMaterialPersisted: false,
      productionChanged: false,
      oneTimeConsumption: true,
    }),

    async withSecret(rawAccess, consumer) {
      const access = normalizeOperatorSecretAccess(rawAccess);
      if (typeof consumer !== "function") throw new TypeError("consumer must be a function");

      const sessionId = sessionIdFromRef(access.secretRef);
      const status = handoffService.status(sessionId);
      if (!status.found) fail("secret_handoff_not_found");
      if (status.purpose !== access.purpose) fail("secret_handoff_purpose_mismatch");

      const consumed = await handoffService.consume({
        sessionId,
        consumer: async (secretBytes, context) => {
          if (context.purpose !== access.purpose) fail("secret_handoff_purpose_mismatch");
          return consumer(Object.freeze({
            bytes: secretBytes,
            version: "handoff-v1",
            expiresAt: status.expiresAt,
          }));
        },
      });

      if (!consumed.ok) fail(consumed.code || "secret_handoff_unavailble");
      return consumed.result;
    },
  });
}
