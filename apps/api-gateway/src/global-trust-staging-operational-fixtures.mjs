const DEFAULT_TENANT_ID = "tenant_staging_global_trust_001";
const OTHER_TENANT_ID = "tenant_staging_global_trust_other";

const IDS = Object.freeze({
  policy: "policy_staging_support_v1",
  draftPolicy: "policy_staging_draft_v1",
  model: "model_staging_support_v1",
  draftModel: "model_staging_draft_v1",
  useCase: "usecase_staging_support_v1",
  draftUseCase: "usecase_staging_draft_v1",
});

function principal(tenantId, {
  id = "staging_service_001",
  kind = "service",
  scopes = [],
} = {}) {
  return Object.freeze({
    principal: Object.freeze({
      id,
      tenantId,
      kind,
      scopes: Object.freeze([...scopes]),
    }),
  });
}

function operatorIdentity(tenantId) {
  return principal(tenantId, {
    id: "staging_operator_001",
    kind: "human",
    scopes: [
      "admission:evaluate",
      "audit:read",
      "simulation:run",
      "model:read",
      "model:write",
      "usecase:read",
      "usecase:write",
      "datapolicy:read",
      "datapolicy:write",
      "tool:invoke",
    ],
  });
}

function serviceIdentity(tenantId, scopes = []) {
  return principal(tenantId, {
    id: "staging_service_001",
    kind: "service",
    scopes,
  });
}

function admissionInput(tenantId, overrides = {}) {
  return {
    identity: serviceIdentity(tenantId, ["admission:evaluate"]),
    modelId: IDS.model,
    useCaseId: IDS.useCase,
    dataPolicyId: IDS.policy,
    locale: "pt-BR",
    toolIds: [],
    dataClasses: ["public"],
    region: "BR",
    sensitiveData: false,
    correlationId: "corr_staging_admission",
    ...overrides,
  };
}

function simulationInput(tenantId, overrides = {}) {
  return {
    identity: serviceIdentity(tenantId, [
      "admission:evaluate",
      "simulation:run",
      "tool:invoke",
    ]),
    modelId: IDS.model,
    useCaseId: IDS.useCase,
    dataPolicyId: IDS.policy,
    locale: "pt-BR",
    region: "BR",
    dataClasses: ["public"],
    sensitiveData: false,
    prompt: "Summarize the approved synthetic support policy.",
    syntheticOutput: "The approved synthetic support policy summary is ready.",
    toolProposals: [],
    correlationId: "corr_staging_simulation",
    ...overrides,
  };
}

function toolProposal(overrides = {}) {
  return {
    toolId: "crm.read",
    action: "read",
    useCase: "customer_support",
    correlationId: "corr_staging_tool",
    callCount: 1,
    executionClass: "read",
    arguments: { customerId: "synthetic_customer_001" },
    ...overrides,
  };
}

async function seedStagingRegistries(gateway, tenantId) {
  const identity = operatorIdentity(tenantId);

  await gateway.dataPolicyRegistry.register({
    identity,
    dataPolicyId: IDS.policy,
    ownerId: "owner_staging_001",
    purpose: "customer_support",
    allowedDataClasses: ["public", "pii"],
    allowedRegions: ["BR"],
    retentionDays: 30,
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
    providerTrainingAllowed: false,
    crossTenantSharingAllowed: false,
    redactionRequired: true,
    humanReviewRequiredForSensitiveData: true,
    correlationId: "corr_seed_policy",
  });
  await gateway.dataPolicyRegistry.transition({
    identity,
    dataPolicyId: IDS.policy,
    status: "approved",
    reasonCode: "staging_policy_review_passed",
    correlationId: "corr_seed_policy_approve",
  });
  await gateway.dataPolicyRegistry.register({
    identity,
    dataPolicyId: IDS.draftPolicy,
    ownerId: "owner_staging_001",
    purpose: "customer_support",
    allowedDataClasses: ["public"],
    allowedRegions: ["BR"],
    retentionDays: 1,
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
    providerTrainingAllowed: false,
    crossTenantSharingAllowed: false,
    redactionRequired: true,
    humanReviewRequiredForSensitiveData: true,
    correlationId: "corr_seed_draft_policy",
  });

  await gateway.modelRegistry.register({
    identity,
    modelId: IDS.model,
    provider: "null_provider",
    model: "synthetic-safe-model",
    version: "2026-07-29",
    purpose: "customer_support",
    dataPolicyId: IDS.policy,
    allowedLocales: ["pt-BR"],
    correlationId: "corr_seed_model",
  });
  await gateway.modelRegistry.transition({
    identity,
    modelId: IDS.model,
    status: "approved",
    reasonCode: "staging_model_review_passed",
    correlationId: "corr_seed_model_approve",
  });
  await gateway.modelRegistry.register({
    identity,
    modelId: IDS.draftModel,
    provider: "null_provider",
    model: "synthetic-draft-model",
    version: "2026-07-29",
    purpose: "customer_support",
    dataPolicyId: IDS.policy,
    allowedLocales: ["pt-BR"],
    correlationId: "corr_seed_draft_model",
  });

  await gateway.useCaseRegistry.register({
    identity,
    useCaseId: IDS.useCase,
    ownerId: "owner_staging_001",
    purpose: "customer_support",
    dataPolicyId: IDS.policy,
    riskLevel: "moderate",
    allowedModelIds: [IDS.model],
    allowedToolIds: ["crm.read"],
    allowedLocales: ["pt-BR"],
    humanApprovalRequired: false,
    correlationId: "corr_seed_usecase",
  });
  await gateway.useCaseRegistry.transition({
    identity,
    useCaseId: IDS.useCase,
    status: "approved",
    reasonCode: "staging_use_case_review_passed",
    correlationId: "corr_seed_usecase_approve",
  });
  await gateway.useCaseRegistry.register({
    identity,
    useCaseId: IDS.draftUseCase,
    ownerId: "owner_staging_001",
    purpose: "customer_support",
    dataPolicyId: IDS.policy,
    riskLevel: "moderate",
    allowedModelIds: [IDS.model],
    allowedToolIds: [],
    allowedLocales: ["pt-BR"],
    humanApprovalRequired: false,
    correlationId: "corr_seed_draft_usecase",
  });
}

export {
  DEFAULT_TENANT_ID,
  OTHER_TENANT_ID,
  IDS,
  admissionInput,
  operatorIdentity,
  seedStagingRegistries,
  serviceIdentity,
  simulationInput,
  toolProposal,
};
