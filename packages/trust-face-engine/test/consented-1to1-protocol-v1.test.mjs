import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1,
  buildConsented1to1EvaluationProtocol,
} from "../src/consented-1to1-protocol-v1.mjs";

function manifest() {
  return {
    digest: "sha256:fixture",
    authority: { basis: "consented-lab" },
    samples: [
      { sampleId: "a-enroll", subjectId: "subject-a", assetRef: "asset:a1", role: "enrollment" },
      { sampleId: "a-probe", subjectId: "subject-a", assetRef: "asset:a2", role: "probe" },
      { sampleId: "b-enroll", subjectId: "subject-b", assetRef: "asset:b1", role: "enrollment" },
      { sampleId: "b-probe", subjectId: "subject-b", assetRef: "asset:b2", role: "probe" },
    ],
  };
}

test("profile keeps consented 1:1 evaluation non-production and non-claiming", () => {
  assert.equal(TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.authorityBasisRequired, "consented-lab");
  assert.equal(TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.rawBiometricPayloadAccepted, false);
  assert.equal(TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.rawEmbeddingAccepted, false);
  assert.equal(TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.realMetricsReady, false);
  assert.equal(TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.productionReady, false);
  assert.equal(TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.biometricClaimReady, false);
});

test("protocol creates deterministic enrollment-to-probe genuine and impostor pairs", () => {
  const a = buildConsented1to1EvaluationProtocol({ manifest: manifest() });
  const b = buildConsented1to1EvaluationProtocol({ manifest: manifest() });
  assert.equal(a.subjectCount, 2);
  assert.equal(a.enrollmentSampleCount, 2);
  assert.equal(a.probeSampleCount, 2);
  assert.equal(a.genuinePairCount, 2);
  assert.equal(a.impostorPairCount, 2);
  assert.equal(a.pairCount, 4);
  assert.match(a.protocolDigest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(a, b);
  assert.ok(a.pairs.filter((pair)=>pair.sameSubject).every((pair)=>pair.pairId.startsWith("genuine:")));
  assert.ok(a.pairs.filter((pair)=>!pair.sameSubject).every((pair)=>pair.pairId.startsWith("impostor:")));
  assert.equal(a.realMetricsReady, false);
});

test("protocol rejects manifests without consented-lab authority", () => {
  const value = manifest();
  value.authority.basis = "synthetic";
  assert.throws(
    () => buildConsented1to1EvaluationProtocol({ manifest: value }),
    (error) => error?.code === "consented_lab_authority_required",
  );
});

test("protocol rejects raw biometrics and embeddings in metadata", () => {
  const value = manifest();
  value.samples[0].embedding = [1, 0, 0];
  assert.throws(
    () => buildConsented1to1EvaluationProtocol({ manifest: value }),
    (error) => error?.code === "raw_biometric_payload_forbidden",
  );
});

test("protocol requires enrollment and probe roles for every subject", () => {
  const value = manifest();
  value.samples = value.samples.filter((sample) => sample.sampleId !== "b-probe");
  assert.throws(
    () => buildConsented1to1EvaluationProtocol({ manifest: value }),
    (error) => error?.code === "incomplete_subject_roles",
  );
});
