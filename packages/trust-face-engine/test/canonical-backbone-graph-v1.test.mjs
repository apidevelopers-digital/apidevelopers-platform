import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CANONICAL_BACKBONE_GRAPH_V1,
  createCanonicalBackboneTrainingGraph,
  runCanonicalAngularMarginContractSmoke,
} from "../src/canonical-backbone-graph-v1.mjs";

test("canonical graph locks four stages, eight blocks and 512D L2 head", () => {
  const graph = createCanonicalBackboneTrainingGraph();

  assert.deepEqual(graph.stageWidths, [64, 96, 160, 256]);
  assert.deepEqual(graph.stageDepths, [1, 2, 3, 2]);
  assert.equal(graph.blockCount, 8);
  assert.equal(graph.embeddingDim, 512);
  assert.equal(graph.head.normalization, "l2");
  assert.equal(graph.trainingObjective.family, "additive-angular-margin");
});

test("canonical graph remains non-production until full backprop is implemented", () => {
  assert.equal(TRUST_FACE_CANONICAL_BACKBONE_GRAPH_V1.productionReady, false);
  assert.equal(TRUST_FACE_CANONICAL_BACKBONE_GRAPH_V1.biometricClaimReady, false);
  assert.equal(TRUST_FACE_CANONICAL_BACKBONE_GRAPH_V1.biometricBackboneReady, false);
  assert.equal(TRUST_FACE_CANONICAL_BACKBONE_GRAPH_V1.fullBackpropReady, false);
  assert.equal(TRUST_FACE_CANONICAL_BACKBONE_GRAPH_V1.realBiometricTrainingAuthorized, false);
});

test("angular-margin head is executable against the canonical 512D contract", () => {
  const result = runCanonicalAngularMarginContractSmoke({
    classCount: 5,
    targetIndex: 2,
    scale: 32,
    marginRadians: 0.35,
    qualityZ: -0.25,
  });

  assert.equal(result.blockCount, 8);
  assert.deepEqual(result.stageWidths, [64, 96, 160, 256]);
  assert.deepEqual(result.stageDepths, [1, 2, 3, 2]);
  assert.equal(result.embeddingDim, 512);
  assert.equal(result.objectiveFamily, "additive-angular-margin");
  assert.equal(result.qualityAware, true);
  assert.equal(result.finiteLoss, true);
  assert.ok(Number.isFinite(result.loss));
  assert.equal(result.fullBackpropReady, false);
  assert.equal(result.biometricBackboneReady, false);
});
