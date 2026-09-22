import {
  OperatorSecretContractError,
  normalizeOperatorSecretAccess,
} from "./operator-secret-provider-contract.mjs";

const MAX_PROVIDER_SECRET_BYTES = 8192;
const HANDOFF_REF_PATTERN = /^secret:\/\/handoff\/([A-Za-z0-9._:-]{3,128})$/;

function fail(code, message, details = {}) {
  throw new OperatorSecretContractError(code, message, details);
}

function sessionIdFromRef(secretRef) {
  const match = HANDOFF_REF_PATTERN.exec(secretRef);
  if (!match) {
    fail(
      "secret_ref_unsupported",
      "secretRef is not an operator handoff reference",
      { field: "secretRef" },
    );
  }
  return match[1];
}

function mapUnavailable(status) {
  if (!status?.found || status.state === "not_found") {
    return ["secret_unavailable", "secret handoff session was not found"];
  }
  if (status.state === "expired") {
    return ["secret_expired", "secret handoff session expired"];
  }
  if (status.state === "consumed") {
    return ["secret_consumed", "secret handoff session was already consumed"];
  }
  return ["secret_unavailable", "secret handoff has not received a secret"];
}

export function createSecretHandoffOperatorSecretProvider({
  handoffService,
} = {}) {
  if (
    typeof handoffService?.status !== "function" ||
    typeof handoffService?.consume !== "function"
  ) {
    throw new TypeError("handoffService must expose status and consume functions");
  }

  return Object.freeze({
    async withSecret(access, consumer) {
      const normalizedAccess = normalizeOperatorSecretAccess(access);
      if (typeof consumer !== "function") {
        throw new TypeError("consumer must be a function");
      }

      const sessionId = sessionIdFromRef(normalizedAccess.secretRef);
      const status = handoffService.status(sessionId);

      if (
        !status?.found ||
        status.state !== "secret_received"
      ) {
        const [code, message] = mapUnavailable(status);
        fail(code, message);
      }

      if (status.purpose !== normalizedAccess.purpose) {
        fail(
          "secret_purpose_mismatch",
          "secret handoff purpose does not match requested secret access",
          { field: "purpose" },
        );
      }

      let callbackCount = 0;
      const consumed = await handoffService.consume({
        sessionId,
        consumer: async (bytes) => {
          callbackCount += 1;
          if (callbackCount > 1) {
            fail(
              "secret_contract_violation",
              "secret handoff invoked provider consumer more than once",
            );
          }

          const leaseBytes = Buffer.from(bytes);
          if (
            leaseBytes.byteLength < 1 ||
            leaseBytes.byteLength > MAX_PROVIDER_SECRET_BYTES
          ) {
            leaseBytes.fill(0);
            fail(
              "secret_contract_violation",
              "secret handoff lease length is outside the operator provider contract",
              { field: "bytes" },
            );
          }
          try {
            return await consumer(Object.freeze({
              bytes: leaseBytes,
              expiresAt: status.expiresAt,
            }));
          } finally {
            leaseBytes.fill(0);
          }
        },
      });

      if (!consumed?.ok) {
        fail("secret_unavailable", "secret handoff could not be consumed");
      }
      if (callbackCount !== 1) {
        fail(
          "secret_contract_violation",
          "secret handoff did not invoke provider consumer exactly once",
        );
      }

      return consumed.result;
    },
  });
}

export function createSecretHandoffRef(sessionId) {
  const normalized = String(sessionId ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(normalized)) {
    throw new TypeError("sessionId is invalid");
  }
  return `secret://handoff/${normalized}`;
}
