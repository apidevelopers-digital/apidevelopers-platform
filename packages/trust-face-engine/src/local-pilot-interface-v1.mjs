export const TRUST_FACE_LOCAL_PILOT_INTERFACE_V1 = Object.freeze({
  version: "trust-face-local-pilot-interface/v1",
  localOnly: true,
  githubActionsExecutionAllowed: false,
  networkInputAllowed: false,
  syntheticExecutionEnabled: true,
  consentedHumanExecutionEnabled: false,
  cameraExecutionEnabled: false,
  benchmarkAllowed: false,
  thresholdAllowed: false,
  identityClaimAllowed: false,
  productionAllowed: false,
});

function contractError(message, code) {
  return Object.assign(new Error(message), { code });
}

export function createTrustFaceLocalPilotPlanV1({
  inputKind = "synthetic",
  sourceKind = "file",
  githubActions = false,
  executionRequested = false,
} = {}) {
  if (!["synthetic", "consented-human"].includes(inputKind)) {
    throw contractError("input kind", "local_pilot_input_kind_invalid");
  }
  if (!["file", "camera"].includes(sourceKind)) {
    throw contractError("source kind", "local_pilot_source_kind_invalid");
  }
  if (sourceKind === "camera" && inputKind !== "consented-human") {
    throw contractError("camera source", "local_pilot_camera_requires_human_gate");
  }

  let blockReason = null;
  if (executionRequested && githubActions) {
    blockReason = "github_actions_execution_forbidden";
  } else if (executionRequested && inputKind === "consented-human") {
    blockReason = "consented_human_execution_requires_separate_gate";
  } else if (executionRequested && sourceKind === "camera") {
    blockReason = "camera_execution_requires_separate_gate";
  }

  return Object.freeze({
    version: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.version,
    inputKind,
    sourceKind,
    localOnly: true,
    executionRequested,
    executionAllowed: blockReason === null,
    blockReason,
    githubActionsTransportAllowed: false,
    networkInputAllowed: false,
    inputPathEmitted: false,
    fileNameEmitted: false,
    alignedCropPersisted: false,
    embeddingPersisted: false,
    embeddingLogged: false,
    outputVectorExposed: false,
    benchmarkAllowed: false,
    thresholdAllowed: false,
    identityClaimAllowed: false,
    productionAllowed: false,
  });
}

export function assertTrustFaceLocalPilotSanitizedStatusV1(status = {}) {
  const sensitiveKeys = [
    "path",
    "inputPath",
    "fileName",
    "rawImage",
    "crop",
    "embedding",
    "vector",
    "cosine",
    "identity",
    "person",
  ];
  for (const key of sensitiveKeys) {
    if (Object.hasOwn(status, key)) {
      throw contractError(key, "local_pilot_status_sensitive_field_forbidden");
    }
  }

  const forbiddenClaims = [
    "benchmarkExecuted",
    "thresholdApplied",
    "identityClaimed",
    "calibrationMutationPerformed",
    "productionAuthorized",
  ];
  for (const key of forbiddenClaims) {
    if (status[key] === true) {
      throw contractError(key, "local_pilot_status_scope_violation");
    }
  }

  return Object.freeze({
    version: "trust-face-local-pilot-interface-status/v1",
    localInterface: status.localInterface === true,
    inputKind: status.inputKind ?? null,
    sourceKind: status.sourceKind ?? null,
    executionCompleted: status.executionCompleted === true,
    syntheticInputOnly: status.syntheticInputOnly === true,
    detectedFaceCount: Number.isInteger(status.detectedFaceCount) ? status.detectedFaceCount : null,
    landmarkCount: Number.isInteger(status.landmarkCount) ? status.landmarkCount : null,
    alignment: status.alignment ?? null,
    aurafaceOutputDim: Number.isInteger(status.aurafaceOutputDim) ? status.aurafaceOutputDim : null,
    outputFinite: status.outputFinite === true,
    outputNonZero: status.outputNonZero === true,
    downstreamL2NormalizationApplied: status.downstreamL2NormalizationApplied === true,
  });
}

// Backward-compatible aliases for the initial scaffold names.
export const LOCAL_PILOT_V1 = Object.freeze({
  version: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.version,
  localOnly: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.localOnly,
  githubActionsExecution: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.githubActionsExecutionAllowed,
  networkInput: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.networkInputAllowed,
  synthetic: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.syntheticExecutionEnabled,
  human: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.consentedHumanExecutionEnabled,
  camera: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.cameraExecutionEnabled,
  benchmark: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.benchmarkAllowed,
  threshold: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.thresholdAllowed,
  identity: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.identityClaimAllowed,
  production: TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.productionAllowed,
});

export function localPilotPlan({
  kind = "synthetic",
  source = "file",
  actions = false,
  execute = false,
} = {}) {
  const plan = createTrustFaceLocalPilotPlanV1({
    inputKind: kind,
    sourceKind: source,
    githubActions: actions,
    executionRequested: execute,
  });
  return Object.freeze({
    version: plan.version,
    kind,
    source,
    localOnly: true,
    execute,
    allowed: plan.executionAllowed,
    block: plan.blockReason,
    inputPathEmitted: false,
    fileNameEmitted: false,
    cropStored: false,
    embeddingStored: false,
    embeddingLogged: false,
    vectorExposed: false,
    benchmark: false,
    threshold: false,
    identity: false,
    production: false,
  });
}

export function sanitizeLocalPilotStatus(status = {}) {
  let normalized;
  try {
    normalized = assertTrustFaceLocalPilotSanitizedStatusV1({
      localInterface: status.localInterface,
      inputKind: status.kind,
      sourceKind: status.source,
      executionCompleted: status.completed,
      syntheticInputOnly: status.syntheticOnly,
      detectedFaceCount: status.faces,
      landmarkCount: status.landmarks,
      alignment: status.alignment,
      aurafaceOutputDim: status.dim,
      benchmarkExecuted: status.benchmark,
      thresholdApplied: status.threshold,
      identityClaimed: status.identityClaimed,
      productionAuthorized: status.production,
      ...(Object.hasOwn(status, "path") ? { path: status.path } : {}),
      ...(Object.hasOwn(status, "inputPath") ? { inputPath: status.inputPath } : {}),
      ...(Object.hasOwn(status, "fileName") ? { fileName: status.fileName } : {}),
      ...(Object.hasOwn(status, "rawImage") ? { rawImage: status.rawImage } : {}),
      ...(Object.hasOwn(status, "crop") ? { crop: status.crop } : {}),
      ...(Object.hasOwn(status, "embedding") ? { embedding: status.embedding } : {}),
      ...(Object.hasOwn(status, "vector") ? { vector: status.vector } : {}),
      ...(Object.hasOwn(status, "cosine") ? { cosine: status.cosine } : {}),
      ...(Object.hasOwn(status, "identity") ? { identity: status.identity } : {}),
      ...(Object.hasOwn(status, "person") ? { person: status.person } : {}),
    });
  } catch (error) {
    if (error?.code === "local_pilot_status_scope_violation") {
      throw contractError(error.message, "local_pilot_scope_violation");
    }
    throw error;
  }

  return Object.freeze({
    version: normalized.version,
    localInterface: normalized.localInterface,
    kind: normalized.inputKind,
    source: normalized.sourceKind,
    completed: normalized.executionCompleted,
    syntheticOnly: normalized.syntheticInputOnly,
    faces: normalized.detectedFaceCount,
    landmarks: normalized.landmarkCount,
    alignment: normalized.alignment,
    dim: normalized.aurafaceOutputDim,
  });
}
