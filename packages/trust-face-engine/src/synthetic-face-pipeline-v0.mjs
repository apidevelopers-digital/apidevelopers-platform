const PIPELINE_ID = 'synthetic_face_pipeline_v0';

export const SYNTHETIC_FACE_PIPELINE_V0 = Object.freeze({
  id: PIPELINE_ID,
  inputWidth: 112,
  inputHeight: 112,
  embeddingDimensions: 512,
  allowedSourceClasses: Object.freeze(['synthetic', 'licensed_synthetic']),
  stages: Object.freeze([
    'source_gate',
    'yunet_5_landmarks',
    'alignment_112x112',
    'auraface_512d',
    'sanitized_receipt',
  ]),
});

function assertFunction(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} adapter is required.`);
  }
}

function assertSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('source descriptor is required.');
  }

  if (!SYNTHETIC_FACE_PIPELINE_V0.allowedSourceClasses.includes(source.sourceClass)) {
    throw new Error('SOURCE_CLASS_NOT_ALLOWED');
  }

  if (source.humanFaceInputUsed !== false || source.biometricInputUsed !== false) {
    throw new Error('NON_BIOMETRIC_SOURCE_REQUIRED');
  }
}

function assertFiveLandmarks(result) {
  if (!result || !Array.isArray(result.landmarks) || result.landmarks.length !== 5) {
    throw new Error('YUNET_FIVE_LANDMARKS_REQUIRED');
  }

  for (const point of result.landmarks) {
    if (
      !point ||
      typeof point !== 'object' ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    ) {
      throw new Error('YUNET_LANDMARK_INVALID');
    }
  }

  return result.landmarks;
}

function assertAlignedFace(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('ALIGNED_FACE_REQUIRED');
  }

  if (
    result.width !== SYNTHETIC_FACE_PIPELINE_V0.inputWidth ||
    result.height !== SYNTHETIC_FACE_PIPELINE_V0.inputHeight
  ) {
    throw new Error('ALIGNED_FACE_112X112_REQUIRED');
  }

  return result;
}

function assertEmbedding(result) {
  if (!result || !Array.isArray(result.embedding)) {
    throw new Error('AURAFACE_EMBEDDING_REQUIRED');
  }

  if (result.embedding.length !== SYNTHETIC_FACE_PIPELINE_V0.embeddingDimensions) {
    throw new Error('AURAFACE_512D_REQUIRED');
  }

  if (!result.embedding.every(Number.isFinite)) {
    throw new Error('AURAFACE_EMBEDDING_NONFINITE');
  }

  return result.embedding;
}

export function createSyntheticFacePipelineV0({
  detectYuNet5Landmarks,
  alignFace112x112,
  inferAuraFace512d,
}) {
  assertFunction(detectYuNet5Landmarks, 'detectYuNet5Landmarks');
  assertFunction(alignFace112x112, 'alignFace112x112');
  assertFunction(inferAuraFace512d, 'inferAuraFace512d');

  return Object.freeze({
    async run({ source, frame }) {
      assertSource(source);

      if (frame === undefined || frame === null) {
        throw new TypeError('frame is required.');
      }

      const detection = await detectYuNet5Landmarks({ frame });
      const landmarks = assertFiveLandmarks(detection);

      const alignedFace = assertAlignedFace(
        await alignFace112x112({
          frame,
          landmarks,
          width: SYNTHETIC_FACE_PIPELINE_V0.inputWidth,
          height: SYNTHETIC_FACE_PIPELINE_V0.inputHeight,
        }),
      );

      const embedding = assertEmbedding(
        await inferAuraFace512d({
          alignedFace,
          preprocessing: Object.freeze({
            width: 112,
            height: 112,
            scale: 1 / 127.5,
            mean: Object.freeze([127.5, 127.5, 127.5]),
            swapRB: true,
            dtype: 'float32',
            outputDimensions: 512,
            downstreamL2Normalization: true,
          }),
        }),
      );

      void embedding;

      return Object.freeze({
        schema: 'trust-face.synthetic-face-pipeline.receipt.v0',
        pipeline: PIPELINE_ID,
        status: 'scaffold_executed_with_injected_adapters',
        sourceClass: source.sourceClass,
        humanFaceInputUsed: false,
        biometricInputUsed: false,
        faceDetectionExecuted: true,
        landmarkCount: 5,
        alignmentExecuted: true,
        alignedWidth: 112,
        alignedHeight: 112,
        embeddingInferenceExecuted: true,
        embeddingDimensions: 512,
        downstreamL2NormalizationRequired: true,
        embeddingReturned: false,
        embeddingPersisted: false,
        embeddingLogged: false,
        thresholdApplied: false,
        benchmarkExecuted: false,
        matchedClaimed: false,
        identityClaimed: false,
        calibrationMutationPerformed: false,
        controlledPilotAuthorized: false,
        productionAuthorized: false,
        productionReady: false,
      });
    },
  });
}
