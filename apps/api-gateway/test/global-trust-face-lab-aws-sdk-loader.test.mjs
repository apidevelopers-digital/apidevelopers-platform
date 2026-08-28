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

test("AWS transport loader remains untouched while live gates are incomplete", async () => {
  let loads = 0;
  const result = await resolveGlobalTrustFaceLabAwsSdk({
    env: {},
    transportFactory: () => {
      loads += 1;
      throw new Error("must not load");
    },
  });

  assert.equal(result, null);
  assert.equal(loads, 0);
  assert.equal(shouldResolveGlobalTrustFaceLabAwsSdk({}), false);
});

test("AWS transport loader resolves native Rekognition and S3 primitives without network", async () => {
  let loads = 0;
  let sends = 0;
  const client = { async send() { sends += 1; } };
  const s3Client = { async send() { sends += 1; } };
  class CreateFaceLivenessSessionCommand {}
  class GetFaceLivenessSessionResultsCommand {}
  class CompareFacesCommand {}
  class PutObjectCommand {}
  class DeleteObjectCommand {}

  const resolved = await resolveGlobalTrustFaceLabAwsSdk({
    env: LIVE_ENV,
    transportFactory: ({ env, region }) => {
      loads += 1;
      assert.equal(env, LIVE_ENV);
      assert.equal(region, "sa-east-1");
      return {
        client,
        commands: {
          CreateFaceLivenessSessionCommand,
          GetFaceLivenessSessionResultsCommand,
          CompareFacesCommand,
        },
        s3Client,
        s3Commands: { PutObjectCommand, DeleteObjectCommand },
      };
    },
  });

  assert.equal(loads, 1);
  assert.equal(sends, 0);
  assert.equal(resolved.client, client);
  assert.equal(resolved.s3Client, s3Client);
  assert.equal(resolved.commands.CompareFacesCommand, CompareFacesCommand);
  assert.equal(resolved.s3Commands.PutObjectCommand, PutObjectCommand);
  assert.deepEqual(resolved.descriptor, {
    provider: "aws-sigv4-native",
    region: "sa-east-1",
    transport: "node-native",
    networkCalled: false,
    credentialsResolved: false,
  });
});

test("AWS transport loader fails closed when native primitives are incomplete", async () => {
  await assert.rejects(
    resolveGlobalTrustFaceLabAwsSdk({
      env: LIVE_ENV,
      transportFactory: () => ({ client: {}, commands: {} }),
    }),
    (error) => error?.code === "TRUST_FACE_LAB_AWS_PRIMITIVE_MISSING",
  );
});
