import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_AURAFACE_512D_PREPROCESSING_CONTRACT_V1 as CONTRACT,
  assertAuraFace512DPreprocessingContractV1,
} from "../src/auraface-512d-preprocessing-contract-v1.mjs";

test("pins the inspected AuraFace ONNX interface and external preprocessing contract", () => {
  const receipt = assertAuraFace512DPreprocessingContractV1();

  assert.equal(receipt.onnxInput.name, "data");
  assert.equal(receipt.onnxInput.dtype, "float32");
  assert.equal(receipt.onnxInput.layout, "NCHW");
  assert.deepEqual(receipt.onnxInput.shape, ["N", 3, 112, 112]);

  assert.equal(receipt.onnxOutput.name, "1333");
  assert.equal(receipt.onnxOutput.dtype, "float32");
  assert.deepEqual(receipt.onnxOutput.shape, [1, 512]);
  assert.equal(receipt.onnxOutput.embeddingDim, 512);
  assert.equal(receipt.onnxOutput.l2NormalizedByModel, false);

  assert.equal(receipt.graph.opset, 11);
  assert.deepEqual(receipt.graph.entryPathOperatorTypesUntilFirstConv, ["Conv"]);
  assert.equal(receipt.graph.entryNormalizationEmbedded, false);

  assert.equal(receipt.preprocessing.alignedImageConvention, "OpenCV-BGR");
  assert.equal(receipt.preprocessing.modelInputChannelOrder, "RGB");
  assert.equal(receipt.preprocessing.swapRB, true);
  assert.equal(receipt.preprocessing.scaleFactor, 1 / 127.5);
  assert.deepEqual(receipt.preprocessing.mean, [127.5, 127.5, 127.5]);
  assert.deepEqual(receipt.preprocessing.std, [127.5, 127.5, 127.5]);
  assert.equal(receipt.preprocessing.formula, "(pixel - 127.5) / 127.5");

  assert.deepEqual(receipt.alignment.template, [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
  ]);
  assert.equal(receipt.postprocessing.rawEmbeddingReturnedByOnnx, true);
  assert.equal(receipt.postprocessing.l2NormalizationRequiredDownstream, true);
});

test("keeps preprocessing contract non-executing and non-authorizing", () => {
  const receipt = assertAuraFace512DPreprocessingContractV1();
  for (const [key, value] of Object.entries(receipt.safety)) {
    assert.equal(value, false, `${key} must remain false`);
  }
});

test("fails closed on preprocessing drift", () => {
  const drifted = {
    ...CONTRACT,
    preprocessing: {
      ...CONTRACT.preprocessing,
      formula: "pixel / 255",
    },
  };

  assert.throws(
    () => assertAuraFace512DPreprocessingContractV1(drifted),
    /formula drift/,
  );
});
