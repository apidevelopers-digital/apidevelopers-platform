function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("TRUST_EVALUATION_OPERATOR_INVALID_INPUT", `${name} is required`);
  return normalized;
}

function assertAdminIdentity(identity) {
  if (!identity || typeof identity !== "object") {
    fail("TRUST_EVALUATION_OPERATOR_UNAUTHORIZED", "operator identity is required");
  }
  const principal = identity.principal ?? {};
  const scopes = Array.isArray(principal.scopes) ? principal.scopes : [];
  if (
    identity.role !== "admin"
    || principal.status !== "active"
    || !String(principal.id ?? "").trim()
    || !scopes.includes("admin:*")
  ) {
    fail("TRUST_EVALUATION_OPERATOR_FORBIDDEN", "active platform admin identity is required");
  }
  return identity;
}

function requireService(value, methods, name) {
  if (!value || typeof value !== "object") {
    fail("TRUST_EVALUATION_OPERATOR_INVALID_DEPENDENCY", `${name} is required`);
  }
  for (const method of methods) {
    if (typeof value[method] !== "function") {
      fail("TRUST_EVALUATION_OPERATOR_INVALID_DEPENDENCY", `${name}.${method} must be a function`);
    }
  }
  return value;
}

function safeReceipt(result) {
  const evaluation = result.evaluation;
  const apiKey = result.apiKey;
  return Object.freeze({
    created: result.created === true,
    secretDelivered: result.secretIssued === true,
    tenantId: evaluation.tenantId,
    workspaceId: evaluation.workspaceId,
    subscriptionId: evaluation.subscriptionId,
    productId: evaluation.productId,
    planId: evaluation.planId,
    environment: evaluation.environment,
    status: evaluation.status,
    expiresAt: evaluation.expiresAt,
    apiKeyId: apiKey?.id ?? evaluation.apiKeyId ?? null,
    apiKeyPrefix: apiKey?.prefix ?? evaluation.apiKeyPrefix ?? null,
    scopes: Object.freeze([...(evaluation.scopes ?? [])]),
    capabilities: Object.freeze([...(evaluation.capabilities ?? [])]),
    limits: Object.freeze({ ...(evaluation.limits ?? {}) }),
    controls: Object.freeze({ ...(evaluation.controls ?? {}) }),
  });
}

function safeAuditMetadata(receipt, correlationId) {
  return Object.freeze({
    correlationId,
    created: receipt.created,
    secretDelivered: receipt.secretDelivered,
    workspaceId: receipt.workspaceId,
    subscriptionId: receipt.subscriptionId,
    productId: receipt.productId,
    planId: receipt.planId,
    environment: receipt.environment,
    status: receipt.status,
    expiresAt: receipt.expiresAt,
    apiKeyId: receipt.apiKeyId,
    apiKeyPrefix: receipt.apiKeyPrefix,
    scopeCount: receipt.scopes.length,
    capabilityCount: receipt.capabilities.length,
    limits: receipt.limits,
    controls: receipt.controls,
  });
}

export function createGlobalTrustEvaluationOperatorProvisioningService({
  evaluationTenantService,
  audit,
  credentialHandoff,
} = {}) {
  const evaluations = requireService(
    evaluationTenantService,
    ["createEvaluation"],
    "evaluationTenantService",
   );
  const auditRecorder = requireService(
    audit,
   ["recordOperatorCapabilityResult"],
    "audit",
  );
  const handoff = requireService(
    credentialHandoff,
    ["deliver"],
    "credentialHandoff",
   );

  return Object.freeze({
    async provision({
      identity,
      organizationId,
      slug,
      displayName,
      ttlMs,
      limits,
      correlationId,
    } = {}) {
      const operator = assertAdminIdentity(identity);
      const resolvedCorrelationId = requireText(correlationId, "correlationId");

      const result = await evaluations.createEvaluation({
        organizationId,
        slug,
        displayName,
        ...(ttlMs === undefined ? {} : { ttlMs }),
        ...(limits === undefined ? {} : { limits }),
      });

      if (!result?.evaluation) {
        fail("TRUST_EVALUATION_OPERATOR_PROVISIONING_FAILED", "evaluation result is unavailable");
      }

      if (
        result.evaluation.environment !== "sandbox"
        || result.evaluation.controls?.financialEgress !== "blocked"
        || result.evaluation.controls?.realMoney !== false
        || result.evaluation.controls?.biometricMaterialAccepted !== false
      ) {
        fail(
          "TRUST_EVALUATION_OPERATOR_BOUNDARY_INVALID",
          "evaluation sandbox boundary is invalid",
        );
      }

      let secretDelivered = false;
      if (result.secretIssued === true) {
        const secret = requireText(result.secret, "issued secret");
        try {
          await handoff.deliver({
            secret,
            tenantId: result.evaluation.tenantId,
            apiKeyId: result.apiKey?.id ?? result.evaluation.apiKeyId,
            apiKeyPrefix: result.apiKey?.prefix ?? result.evaluation.apiKeyPrefix,
            expiresAt: result.evaluation.expiresAt,
            correlationId: resolvedCorrelationId,
          });
          secretDelivered = true;
        } catch (cause) {
          const receipt = safeReceipt({
            ...result,
            secretIssued: false,
          });
          await auditRecorder.recordOperatorCapabilityResult({
            identity: operator,
            tenantId: result.evaluation.tenantId,
            action: "operator.trust_evaluation.provision",
            resource: `trust:evaluation:${result.evaluation.tenantId}`,
            outcome: "failed",
            correlationId: resolvedCorrelationId,
            metadata: {
              ...safeAuditMetadata(receipt, resolvedCorrelationId),
              errorCode: "credential_handoff_failed",
              secretDelivered: false,
            },
          });
          const error = new Error("Trust Evaluation credential handoff failed; recovery is required");
          error.code = "TRUST_EVALUATION_OPERATOR_HANDOFF_FAILED";
          error.cause = cause;
          throw error;
        }
      }

      const receipt = safeReceipt({
        ...result,
        secretIssued: secretDelivered,
      });

      await auditRecorder.recordOperatorCapabilityResult({
        identity: operator,
        tenantId: receipt.tenantId,
        action: "operator.trust_evaluation.provision",
        resource: `trust:evaluation:${receipt.tenantId}`,
        outcome: "success",
        correlationId: resolvedCorrelationId,
        metadata: safeAuditMetadata(receipt, resolvedCorrelationId),
      });

      return receipt;
    },
  });
}
