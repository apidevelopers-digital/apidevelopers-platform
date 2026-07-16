import { randomUUID } from "node:crypto";

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const NON_RETRYABLE_CODES = new Set([
  "VALIDATION_ERROR",
  "AUTHORIZATION_ERROR",
  "CONFIRMATION_REQUIRED",
  "CONFLICT_ERROR",
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorStatus(error) {
  const value = error?.status ?? error?.statusCode ?? error?.response?.status;
  return Number.isInteger(value) ? value : null;
}

function errorCode(error) {
  return typeof error?.code === "string" ? error.code : null;
}

export function isTransientError(error) {
  const status = errorStatus(error);
  const code = errorCode(error);

  if (code && NON_RETRYABLE_CODES.has(code)) return false;
  if (status !== null) return TRANSIENT_STATUS.has(status);

  return ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH", "ECONNREFUSED"].includes(code);
}

export function createRetryPolicy({
  maxAttempts = 4,
  baseDelayMs = 250,
  maxDelayMs = 5_000,
  jitterRatio = 0.2,
  clock = () => new Date().toISOString(),
  sleeper = sleep,
  random = Math.random,
  logger = () => {},
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("maxAttempts must be an integer between 1 and 10");
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new Error("baseDelayMs must be a non-negative number");
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw new Error("maxDelayMs must be greater than or equal to baseDelayMs");
  }
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
    throw new Error("jitterRatio must be between 0 and 1");
  }

  return async function retry(operation, {
    operationId = `operation.${randomUUID()}`,
    stage = "unspecified",
    retryable = isTransientError,
} = {}) {
    if (typeof operation !== "function") throw new Error("operation must be a function");

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = clock();
      try {
        const result = await operation({ attempt, operationId, stage });
        logger({
          operationId,
          stage,
          attempt,
          status: "succeeded",
          startedAt,
          completedAt: clock(),
        });
        return result;
      } catch (error) {
        lastError = error;
        const canRetry = attempt < maxAttempts && retryable(error);

        logger({
          operationId,
          stage,
          attempt,
          status: canRetry ? "retrying" : "failed",
          startedAt,
          completedAt: clock(),
          error: {
            name: error?.name ?? "Error",
            message: error?.message ?? String(error),
            code: errorCode(error),
            status: errorStatus(error),
          },
        });

        if (!canRetry) throw error;

        const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        const jitter = exponential * jitterRatio * ((random() * 2) - 1);
        const delayMs = Math.max(0, Math.round(exponential + jitter));

        await sleeper(delayMs);
      }
    }

    throw lastError;
  };
}

export const retryPolicyDefaults = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
  jitterRatio: 0.2,
  transientStatus: [...TRANSIENT_STATUS],
});
