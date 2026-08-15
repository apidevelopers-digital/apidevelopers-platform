function blocked(operation) {
  const error = new Error(`null provider blocked ${operation}`);
  error.code = "NULL_PROVIDER_EXECUTION_BLOCKED";
  error.operation = operation;
  throw error;
}

export function createGlobalTrustNullProvider({
  providerId = "global-trust-null-provider",
} = {}) {
  const normalizedProviderId = String(providerId ?? "").trim();
  if (!normalizedProviderId) {
    throw new TypeError("providerId is required");
  }

  return Object.freeze({
    contractType: "GlobalTrustNullProvider",
    contractVersion: "1.0",
    providerId: normalizedProviderId,
    mode: "null",
    contactEnabled: false,

    status() {
      return Object.freeze({
        providerId: normalizedProviderId,
        mode: "null",
        contactEnabled: false,
        inferenceEnabled: false,
        toolExecutionEnabled: false,
      });
    },

    infer() {
      return blocked("inference");
    },

    invokeTool() {
      return blocked("tool invocation");
    },
  });
}
