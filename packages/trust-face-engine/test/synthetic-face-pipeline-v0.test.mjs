import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SYNTHETIC_FACE_PIPELINE_V0,
  createSyntheticFacePipelineV0,
} from '../src/synthetic-face-pipeline-v0.mjs';

function createAdapters(callOrder) {
  return {
    detectYuNet5Landmarks: async () => {
      callOrder.push('detect');
      return {
        landmarks: [
          { x: 30, y: 40 },
          { x: 80, y: 40 },
          { x: 56, y: 62 },
          { x: 38, y: 84 },
          { x: 74, y: 84 },
        ],
      };
    },
    alignFace112x112: async ({ width, height }) => {
      callOrder.push('align');
      return { width, height, fixture: 'stub-aligned-face' };
    },
    inferAuraFace512d: async ({ preprocessing }) => {
      callOrder.push('embed');
      assert.equal(preprocessing.width, 112);
      assert.equal(preprocessing.height, 112);
      assert.equal(preprocessing.scale, 1 / 127.5);
      assert.deepEqual(preprocessing.mean, [127.5, 127.5, 127.5]);
      assert.equal(preprocessing.swapRB, true);
      assert.equal(preprocessing.dtype, 'float32');
      assert.equal(preprocessing.outputDimensions, 512);
      assert.equal(preprocessing.downstreamL2Normalization, true);
      return { embedding: Array.from({ length: 512 }, (_, index) => index / 512) };
    },
  };
}

test('scaffold preserves ordered stages and returns sanitized receipt only', async () => {
  const callOrder = [];
  const pipeline = createSyntheticFacePipelineV0(createAdapters(callOrder));

  const receipt = await pipeline.run({
    source: {
      sourceClass: 'synthetic',
      humanFaceInputUsed: false,
      biometricInputUsed: false,
    },
    frame: { fixture: 'procedural-synthetic-stub' },
  });

  assert.deepEqual(callOrder, ['detect', 'align', 'embed']);
  assert.equal(receipt.schema, 'trust-face.synthetic-face-pipeline.receipt.v0');
  assert.equal(receipt.sourceClass, 'synthetic');
  assert.equal(receipt.landmarkCount, 5);
  assert.equal(receipt.alignedWidth, 112);
  assert.equal(receipt.alignedHeight, 112);
  assert.equal(receipt.embeddingDimensions, 512);
  assert.equal(receipt.embeddingReturned, false);
  assert.equal(receipt.embeddingPersisted, false);
  assert.equal(receipt.embeddingLogged, false);
  assert.equal(receipt.thresholdApplied, false);
  assert.equal(receipt.matchedClaimed, false);
  assert.equal(receipt.identityClaimed, false);
  assert.equal(receipt.controlledPilotAuthorized, false);
  assert.equal(receipt.productionAuthorized, false);
  assert.equal('embedding' in receipt, false);
});

test('scaffold fails closed for human or biometric input descriptors', async () => {
  const pipeline = createSyntheticFacePipelineV0(createAdapters([]));

  await assert.rejects(
    pipeline.run({
      source: {
        sourceClass: 'synthetic',
        humanFaceInputUsed: true,
        biometricInputUsed: true,
      },
      frame: {},
    }),
    /NON_BIOMETRIC_SOURCE_REQUIRED/,
  );
});

test('scaffold requires exactly five finite landmarks', async () => {
  const pipeline = createSyntheticFacePipelineV0({
    ...createAdapters([]),
    detectYuNet5Landmarks: async () => ({ landmarks: [{ x: 1, y: 2 }] }),
  });

  await assert.rejects(
    pipeline.run({
      source: {
        sourceClass: 'licensed_synthetic',
        humanFaceInputUsed: false,
        biometricInputUsed: false,
      },
      frame: {},
    }),
    /YUNET_FIVE_LANDMARKS_REQUIRED/,
  );
});

test('scaffold requires AuraFace output shape [512] and does not score', async () => {
  const pipeline = createSyntheticFacePipelineV0({
    ...createAdapters([]),
    inferAuraFace512d: async () => ({ embedding: [0.1, 0.2] }),
  });

  await assert.rejects(
    pipeline.run({
      source: {
        sourceClass: 'synthetic',
        humanFaceInputUsed: false,
        biometricInputUsed: false,
      },
      frame: {},
    }),
    /AURAFACE_512D_REQUIRED/,
  );
});

test('published scaffold constants pin the intended gate boundary', () => {
  assert.equal(SYNTHETIC_FACE_PIPELINE_V0.inputWidth, 112);
  assert.equal(SYNTHETIC_FACE_PIPELINE_V0.inputHeight, 112);
  assert.equal(SYNTHETIC_FACE_PIPELINE_V0.embeddingDimensions, 512);
  assert.deepEqual(SYNTHETIC_FACE_PIPELINE_V0.allowedSourceClasses, [
    'synthetic',
    'licensed_synthetic',
  ]);
});
