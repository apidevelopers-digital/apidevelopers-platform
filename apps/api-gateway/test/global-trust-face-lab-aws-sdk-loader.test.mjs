import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveGlobalTrustFaceLabAwsSdk,
  shouldResolveGlobalTrustFaceLabAwsSdk,
} from "../src/global-trust-face-lab-aws-sdk-loader.mjs";

const LIVE_ENV = Object.freeze({
  TRUST_AWS_LIVE_CALLS_ENABLED: "true",
  TRUST_AWS_CREDENTIALS_ALLOWED: "true",
  TRUST_AWS_SANDBOX_APPROVAL: "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL",
  TRUST_AWS_S3_BUCKET: "trust-sandbox",
  TRUST_AWS_S3_PREFIX: "trust-face-lab/sandbox",
  AWS_REGION: "sa-east-1",
});

test("SDK loader remains untouched while live gates are incomplete", async () => {
  let loads = 0;
  const result = await resolveGlobalTrustFaceLabAwsSdk({
    env: {},
    sdkLoader: async () => {
      loads += 1;
      throw new Error("must not load");
    },
    s3SdkLoader: async () => {
      loads += 1;
      throw new Error("must not load");
    },
  });

  assert.equal(result, null);
  assert.equal(loads, 0);
  assert.equal(shouldResolveGlobalTrustFaceLabAwsSdk({}), false);
});

test("SDK loader resolves Rekognition and S3 primitives without sending network calls", async () => {
  let rekognitionConfig;
  let s3Config;
  let sends = 0;

  class RekognitionClient {
    constructor(config) {
      rekognitionConfig = config;
    }
    async send() {
      sends += 1;
      throw new Error("send must not run during bootstrap");
    }
  }
  class CreateFaceLivenessSessionCommand {}
  class GetFaceLivenessSessionResultsCommand {}
  class CompareFacesCommand {}

  class S3Client {
    constructor(config) {
      s3Config = config;
    }
    async send() {
      sends += 1;
      throw new Error("send must not run during bootstrap");
    }
  }
  class PutObjectCommand {}
  class DeleteObjectCommand {}

  const resolved = await resolveGlobalTrustFaceLabAwsSdk({
    env: LIVE_ENV,
    sdkLoader: async () => ({
      RekognitionClient,
      CreateFaceLivenessSessionCommand,
      GetFaceLivenessSessionResultsCommand,
      CompareFacesCommand,
    }),
    s3SdkLoader: async () => ({
      S3Client,
      PutObjectCommand,
      DeleteObjectCommand,
    }),
  });

  assert.deepEqual(rekognitionConfig, { region: "sa-east-1" });
  assert.deepEqual(s3Config, { region: "sa-east-1" });
  assert.equal(sends, 0);
  assert.equal(typeof resolved.client.send, "function");
  assert.equal(typeof resolved.s3Client.send, "function");
  assert.equal(resolved.commands.CompareFacesCommand, CompareFacesCommand);
  assert.equal(resolved.s3Commands.PutObjectCommand, PutObjectCommand);
  assert.equal(resolved.s3Commands.DeleteObjectCommand, DeleteObjectCommand);
  assert.deepEqual(resolved.descriptor, {
    provider: "aws-rekognition",
    region: "sa-east-1",
    sdk: "@aws-sdk/client-rekognition",
    s3Sdk: "@aws-sdk/client-s3",
    networkCalled: false,
    credentialsResolved: false,
  });
});

test("SDK loader fails closed when an SDK package is absent after all gates become explicit", async () => {
  await assert.rejects(
    resolveGlobalTrustFaceLabAwsSdk({
      env: LIVE_ENV,
      sdkLoader: async () => {
        throw new Error("module not found");
      },
      s3SdkLoader: async () => ({}),
    }),
    (error) => error?.code === "TRUST_FACE_LAB_AWS_SDK_UNAVAILABLE",
  );
});
