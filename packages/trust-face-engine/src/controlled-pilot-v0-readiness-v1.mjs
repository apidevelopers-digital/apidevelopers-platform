export const TRUST_FACE_CONTROLLED_PILOT_V0_READINESS_V1 = Object.freeze({
  version: "trust-face-controlled-pilot-v0-readiness/v1",
  mode: "draft-working-contract",
  target: "supervised-consented-non-authoritative-pilot",
  productionEquivalent: false,
  productionReady: false,
  biometricCertificationClaim: false,
  gates: Object.freeze([
    Object.freeze({
      id: "auraface_512d_runtime",
      weight: 15,
      evidence: "actual pinned AuraFace 512D runtime smoke with deterministic non-biometric input",
    }),
    Object.freeze({
      id: "synthetic_face_pipeline",
      weight: 20,
      evidence: "licensed/synthetic face detector + alignment + AuraFace 512D pipeline evidence",
    }),
    Object.freeze({
      id: "local_pilot_interface",
      weight: 20,
      evidence: "operator-local interface accepts local consented input without GitHub biometric transport",
    }),
    Object.freeze({
      id: "consented_1to1_pilot",
      weight: 20,
      evidence: "one supervised consented 1:1 local pilot execution with sanitized receipt",
    }),
    Object.freeze({
      id: "privacy_fail_closed",
      weight: 10,
      evidence: "no raw image/crop/embedding logging plus retry/fail-closed evidence",
    }),
    Object.freeze({
      id: "pilot_liveness_pad_boundary",
      weight: 5,
      evidence: "liveness/PAD boundary is explicit and non-production; pilot cannot claim high-assurance PAD",
    }),
    Object.freeze({
      id: "operator_runbook_kill_switch",
      weight: 10,
      evidence: "operator runbook, stop/rollback path and explicit pilot scope",
    }),
  ]),
});

export function computeTrustFaceControlledPilotV0ReadinessV1(evidence = {}) {
  const gateResults = TRUST_FACE_CONTROLLED_PILOT_V0_READINESS_V1.gates.map((gate) =>
    Object.freeze({
      id: gate.id,
      weight: gate.weight,
      satisfied: evidence[gate.id] === true,
      evidence: gate.evidence,
    }),
  );

  const percent = gateResults.reduce(
    (sum, gate) => sum + (gate.satisfied ? gate.weight : 0),
    0,
  );

  return Object.freeze({
    version: TRUST_FACE_CONTROLLED_PILOT_V0_READINESS_V1.version,
    target: TRUST_FACE_CONTROLLED_PILOT_V0_READINESS_V1.target,
    percent,
    complete: percent === 100,
    gateResults: Object.freeze(gateResults),
    productionEquivalent: false,
    productionReady: false,
    biometricCertificationClaim: false,
    authoritativeDecisionAllowed: false,
  });
}
