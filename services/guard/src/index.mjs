function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertDependency(value, name, method) {
  if (!value || typeof value[method] !== "function") {
    throw new TypeError(`${name}.${method} must be a function`);
  }
}

function actionFrom(request) {
  if (request.action) return request.action;
  const names = (request.plan?.steps ?? []).map((step) => step.action).filter(Boolean);
  return {
    name: names.length === 1 ? names[0] : names.sort().join("+") || "unknown",
    risk: request.risk ?? "R1",
    tags: request.tags ?? [],
    input: request.policyInput ?? {},
  };
}

export function createGuard({
  policyEngine,
  runtime,
  evidenceRegistry,
  clock = () => new Date().toISOString(),
} = {}) {
  assertDependency(policyEngine, "policyEngine", "evaluate");
  assertDependency(runtime, "runtime", "run");
  if (evidenceRegistry) assertDependency(evidenceRegistry, "evidenceRegistry", "record");
  if (typeof clock !== "function") throw new TypeError("clock must be a function");

  const consumedApprovals = new Set();
  let sequence = 0;

  function recordAudit({
    tenantId,
    guardDecisionId,
    policy,
    state,
    runtimeCalled,
    correlationId,
    error,
  }) {
    const input = {
      evidenceId: `guard.${guardDecisionId}`,
      tenantId: String(tenantId ?? "tenant_unset"),
      type: "audit",
      source: {
        module: "@apidevelopers/guard",
        guardDecisionId,
        policyDecisionId: policy.policyDecisionId,
      },
      payload: {
        state,
        effect: policy.effect,
        risk: policy.risk,
        dryRun: policy.dryRun,
        planHash: policy.planHash,
        reasons: policy.reasons,
        runtimeCalled,
        error: error ?? null,
      },
      correlationId: correlationId ?? null,
    };
    return evidenceRegistry ? evidenceRegistry.record(input) : input;
  }

  return Object.freeze({
    async run(request = {}) {
      const evaluatedAt = clock();
      const guardDecisionId = `guard.${evaluatedAt
        .replace(/[-:.TZ]/g, "")
        .toLowerCase()}.${++sequence}`;
      const approvalId = request.approval?.approvalId ?? null;
      const replayed = approvalId ? consumedApprovals.has(approvalId) : false;

      const policy = policyEngine.evaluate({
        tenantId: request.tenantId,
        action: actionFrom(request),
        decision: request.decision,
        plan: request.plan,
        dryRun: request.dryRun !== false,
        approval: request.approval,
        context: {
          ...(request.context ?? {}),
          approvalReplayed: replayed,
        },
      });

      if (policy.effect !== "allow") {
        const state = policy.effect === "review" ? "review-required" : "blocked";
        const evidence = recordAudit({
          tenantId: request.tenantId,
          guardDecisionId,
          policy,
          state,
          runtimeCalled: false,
          correlationId: request.correlationId,
        });
        return deepFreeze({
          guardDecisionId,
          evaluatedAt,
          state,
          runtimeCalled: false,
          approvalConsumed: false,
          policy: clone(policy),
          runtime: null,
          evidence: [clone(evidence)],
        });
      }

      try {
        const runtimeReport = await runtime.run(request.decision, request.plan, {
          dryRun: request.dryRun !== false,
          approval: request.approval,
          confirmation: request.confirmation,
          tenantId: request.tenantId,
          requestId: request.requestId,
          correlationId: request.correlationId,
          continueOnError: request.continueOnError,
        });

        const executed =
          request.dryRun === false && runtimeReport?.state === "executed";
        if (executed && approvalId) consumedApprovals.add(approvalId);

        const evidence = recordAudit({
          tenantId: request.tenantId,
          guardDecisionId,
          policy,
          state: runtimeReport?.state ?? "completed",
          runtimeCalled: true,
          correlationId: request.correlationId,
        });

        return deepFreeze({
          guardDecisionId,
          evaluatedAt,
          state: runtimeReport?.state ?? "completed",
          runtimeCalled: true,
          approvalConsumed: executed,
          policy: clone(policy),
          runtime: clone(runtimeReport),
          evidence: [clone(evidence), ...(runtimeReport?.evidence ?? []).map(clone)],
        });
      } catch (error) {
        const message = String(error?.message ?? error);
        const evidence = recordAudit({
          tenantId: request.tenantId,
          guardDecisionId,
          policy,
          state: "failed",
          runtimeCalled: true,
          correlationId: request.correlationId,
          error: message,
        });
        return deepFreeze({
          guardDecisionId,
          evaluatedAt,
          state: "failed",
          runtimeCalled: true,
          approvalConsumed: false,
          policy: clone(policy),
          runtime: null,
          error: message,
          evidence: [clone(evidence)],
        });
      }
    },

    approvalConsumed(approvalId) {
      return consumedApprovals.has(String(approvalId));
    },
  });
}
