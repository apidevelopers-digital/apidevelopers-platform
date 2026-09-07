export const CONTROLLED_PILOT_PRIVACY_FAIL_CLOSED_V1 = Object.freeze({
  version: "trust-face-controlled-pilot-privacy-fail-closed/v1",
  localOnly: true,
  rawBiometricNetworkTransportAllowed: false,
  githubActionsBiometricTransportAllowed: false,
  rawImagePersistenceAllowed: false,
  alignedCropPersistenceAllowed: false,
  embeddingPersistenceAllowed: false,
  embeddingLoggingAllowed: false,
  outputVectorExposureAllowed: false,
  thresholdAllowed: false,
  identityClaimAllowed: false,
  productionAllowed: false,
});

const sensitiveKeys = new Set([
  "path","inputPath","fileName","filename","rawImage","imageBytes",
  "crop","alignedCrop","embedding","normalizedEmbedding","vector","cosine",
  "identity","person","biometricTemplate"
]);

export function assertControlledPilotPrivacyFailClosedV1(event = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    const e = new Error("event object required"); e.code = "privacy_event_required"; throw e;
  }
  for (const key of sensitiveKeys) {
    if (Object.prototype.hasOwnProperty.call(event, key)) {
      const e = new Error(`${key} must not be emitted`);
      e.code = "privacy_sensitive_field_forbidden";
      throw e;
    }
  }
  for (const key of ["networkBiometricTransport","githubActionsBiometricTransport","rawImagePersisted","alignedCropPersisted","embeddingPersisted","embeddingLogged","outputVectorExposed","thresholdApplied","identityClaimed","productionAuthorized"]) {
    if (event[key] === true) {
      const e = new Error(`${key} must remain false`);
      e.code = "privacy_fail_closed_violation";
      throw e;
    }
  }
  return Object.freeze({
    version: CONTROLLED_PILOT_PRIVACY_FAIL_CLOSED_V1.version,
    localOnly: event.localOnly === true,
    executionCompleted: event.executionCompleted === true,
    syntheticInputOnly: event.syntheticInputOnly === true,
    networkBiometricTransport: false,
    githubActionsBiometricTransport: false,
    rawImagePersisted: false,
    alignedCropPersisted: false,
    embeddingPersisted: false,
    embeddingLogged: false,
    outputVectorExposed: false,
    thresholdApplied: false,
    identityClaimed: false,
    productionAuthorized: false,
  });
}
