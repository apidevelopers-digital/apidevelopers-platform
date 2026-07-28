import { randomUUID } from "node:crypto";

import {
  ADMISSION_DECISION_COLLECTION,
  createGlobalTrustAdmissionGateIntegrity,
} from "./global-trust-admission-gate-integrity.mjs";

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function normalizedStrings(value, name, maximum = 50) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  if (value.length > maximum) {
    throw new RangeError(`${name} must contain at most ${maximum} items`);
  }
  const normalized = value.map((item, index) => required(item, `${name}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${name} must not contain duplicates`);
  }
  return Object.freeze(normalized.sort());
}

function positiveInteger(value, name, maximum = 500) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return normalized;
}

function includesAll(allowed, requested) {
  const allowedSet = new Set(Array.isArray(allowed) ? allowed : []);
  return requested.every((item) => allowedSet.has(item));
}

function reason(code, effect, details = {}) {
  return Object.freeze({ code, effect, ...details });
}

function snapshots({ model, useCase, dataPolicy }) {
  return Object.freeze({
    model: model
      ? Object.freeze({
          modelId: model.modelId,
          status: model.status,
          version: model.version,
          dataPolicyId: model.dataPolicyId,
        })
      : null,
    useCase: useCase
      ? Object.freeze({
          useCaseId: useCase.useCaseId,
          status: useCase.status,
          dataPolicyId: useCase.dataPolicyId,
          riskLevel: useCase.riskLevel,
        })
      : null,
    dataPolicy: dataPolicy
      ? Object.freeze({
          dataPolicyId: dataPolicy.dataPolicyId,
          status: dataPolicy.status,
          retentionDays: dataPolicy.retentionDays,
        })
      : null,
  });
}

export function createGlobalTrustAdmissionGate({
  store,
  modelRegistry,
  useCaseRegistry,
  dataPolicyRegistry,
  integrity = createGlobalTrustAdmissionGateIntegrity({ store }),
  decisionIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }
  for (const [name, registry] of [
    ["modelRegistry", modelRegistry],
    ["useCaseRegistry", useCaseRegistry],
    ["dataPolicyRegistry", dataPolicyRegistry],
  ]) {
    if (typeof registry?.get !== "function") {
      throw new TypeError(`${name}.get is required`);
    }
  }
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction is required");
  }

  return Object.freeze({
    async evaluate({
      identity,
      modelId,
      useCaseId,
      dataPolicyId,
      locale,
      toolIds,
      dataClasses,
      region,
      sensitiveData = false,
      correlationId,
    } = {}) {
      const principal = identity?.principal ?? {};
      const tenantId = required(principal.tenantId, "identity.principal.tenantId");
      const principalId = required(principal.id, "identity.principal.id");
      const principalKind = required(principal.kind ?? "unknown", "identity.principal.kind");
      const normalizedModelId = required(modelId, "modelId");
      const normalizedUseCaseId = required(useCaseId, "useCaseId");
      const normalizedDataPolicyId = required(dataPolicyId, "dataPolicyId");
      const normalizedLocale = required(locale, "locale");
      const normalizedRegion = required(region, "region");
      const normalizedToolIds = normalizedStrings(toolIds, "toolIds");
      const normalizedDataClasses = normalizedStrings(dataClasses, "dataClasses");
      const normalizedCorrelationId = required(correlationId, "correlationId");

      const [model, useCase, dataPolicy] = await Promise.all([
        modelRegistry.get({ tenantId, modelId: normalizedModelId }),
        useCaseRegistry.get({ tenantId, useCaseId: normalizedUseCaseId }),
        dataPolicyRegistry.get({ tenantId, dataPolicyId: normalizedDataPolicyId }),
      ]);

      const reasons = [];

      if (!model) reasons.push(reason("model_not_registered", "deny"));
      if (!useCase) reasons.push(reason("use_case_not_registered", "deny"));
      if (!dataPolicy) reasons.push(reason("data_policy_not_registered", "deny"));

      if (model && model.status !== "approved") {
        reasons.push(reason("model_not_approved", "deny", { status: model.status }));
      }
      if (useCase && useCase.status !== "approved") {
        reasons.push(reason("use_case_not_approved", "deny", { status: useCase.status }));
      }
      if (dataPolicy && dataPolicy.status !== "approved") {
        reasons.push(reason("data_policy_not_approved", "deny", { status: dataPolicy.status }));
      }

      if (model && model.dataPolicyId !== normalizedDataPolicyId) {
        reasons.push(reason("model_data_policy_mismatch", "deny"));
      }
      if (useCase && useCase.dataPolicyId !== normalizedDataPolicyId) {
        reasons.push(reason("use_case_data_policy_mismatch", "deny"));
      }
      if (
        useCase
        && !new Set(useCase.allowedModelIds ?? []).has(normalizedModelId)
      ) {
        reasons.push(reason("model_not_allowed_for_use_case", "deny"));
      }
      if (
        model
        && !new Set(model.allowedLocales ?? []).has(normalizedLocale)
      ) {
        reasons.push(reason("locale_not_allowed_by_model", "deny"));
      }
      if (
        useCase
        && !new Set(useCase.allowedLocales ?? []).has(normalizedLocale)
      ) {
        reasons.push(reason("locale_not_allowed_by_use_case", "deny"));
      }
      if (
        useCase
        && !includesAll(useCase.allowedToolIds, normalizedToolIds)
      ) {
        reasons.push(reason("tool_not_allowed_for_use_case", "deny"));
      }
      if (
        dataPolicy
        && !includesAll(dataPolicy.allowedDataClasses, normalizedDataClasses)
      ) {
        reasons.push(reason("data_class_not_allowed_by_policy", "deny"));
      }
      if (
        dataPolicy
        && !new Set(dataPolicy.allowedRegions ?? []).has(normalizedRegion)
      ) {
        reasons.push(reason("region_not_allowed_by_policy", "deny"));
      }

      if (useCase?.humanApprovalRequired === true) {
        reasons.push(reason("use_case_human_approval_required", "review"));
      }
      if (
        Boolean(sensitiveData)
        && dataPolicy?.humanReviewRequiredForSensitiveData === true
      ) {
        reasons.push(reason("sensitive_data_human_review_required", "review"));
      }

      if (reasons.length === 0) {
        reasons.push(reason("registry_constraints_satisfied", "allow"));
      }

      const hasDeny = reasons.some((item) => item.effect === "deny");
      const hasReview = reasons.some((item) => item.effect === "review");
      const outcome = hasDeny ? "deny" : hasReview ? "review" : "allow";
      const evaluatedAt = required(now(), "evaluatedAt");
      const decision = Object.freeze({
        contractType: "GlobalTrustAdmissionDecision",
        contractVersion: "1.0",
        decisionId: required(decisionIdFactory(), "decisionId"),
        tenantId,
        principalId,
        principalKind,
        modelId: normalizedModelId,
        useCaseId: normalizedUseCaseId,
        dataPolicyId: normalizedDataPolicyId,
        locale: normalizedLocale,
        region: normalizedRegion,
        toolIds: normalizedToolIds,
        dataClasses: normalizedDataClasses,
        sensitiveData: Boolean(sensitiveData),
        outcome,
        admitted: outcome === "allow",
        humanReviewRequired: outcome === "review",
        reasonCodes: Object.freeze(
          [...new Set(reasons.map((item) => item.code))].sort(),
        ),
        reasons: Object.freeze(reasons),
        registrySnapshot: snapshots({ model, useCase, dataPolicy }),
        policyVersion: "global-trust-admission-v1",
        correlationId: normalizedCorrelationId,
        evaluatedAt,
        promptContentIncluded: false,
        outputContentIncluded: false,
        secretMaterialIncluded: false,
        modelExecuted: false,
        toolExecuted: false,
        providerContacted: false,
        automaticRemediationExecuted: false,
      });

      const transaction = await store.transaction((tx) => {
        tx.put(
          ADMISSION_DECISION_COLLECTION,
          decision.decisionId,
          decision,
          { ifAbsent: true },
        );
        integrity.appendInTransaction(tx, {
          tenantId,
          recordId: decision.decisionId,
          payload: decision,
        });
        return decision;
      });
      return transaction.result;
    },

    async listTenant({ tenantId, limit = 100 } = {}) {
      const tenant = required(tenantId, "tenantId");
      const normalizedLimit = positiveInteger(limit, "limit");
      const transaction = await store.transaction((tx) =>
        tx.list(ADMISSION_DECISION_COLLECTION)
          .map(({ value }) => value)
          .filter((decision) => decision?.tenantId === tenant)
          .sort((left, right) =>
            right.evaluatedAt.localeCompare(left.evaluatedAt)
            || left.decisionId.localeCompare(right.decisionId)
          )
          .slice(0, normalizedLimit)
      );
      return Object.freeze(transaction.result);
    },
  });
}
