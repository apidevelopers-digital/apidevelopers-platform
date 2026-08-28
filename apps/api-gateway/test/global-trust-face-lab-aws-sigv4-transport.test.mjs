import assert from "node:assert/strict";
import test from "node:test";

import {
  CompareFacesCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  createGlobalTrustFaceLabAwsSigV4Primitives,
} from "../src/global-trust-face-lab-aws-sigv4-transport.mjs";

const ENV = Object.freeze({
  AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "test-secret-key-not-real",
  AWS_SESSION_TOKEN: "test-session-token-not-real",
});

const NOW = () => new Date("2026-08-28T12:34:56.000Z");

test("native SigV4 primitives stay network-idle until send", () => {
  let calls = 0;
  const primitives = createGlobalTrustFaceLabAwsSigV4Primitives({
    env: ENV,
    now: NOW,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not run during construction");
    },
  });

  assert.equal(calls, 0);
  assert.equal(primitives.descriptor.transport, "node-native");
  assert.equal(primitives.descriptor.networkCalled, false);
  assert.equal(primitives.descriptor.credentialsResolved, false);
});

test("native Rekognition transport signs CompareFaces without leaking secret", async () => {
  const calls = [];
  const primitives = createGlobalTrustFaceLabAwsSigV4Primitives({
    env: ENV,
    now: NOW,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        FaceMatches: [{ Similarity: 98.2 }],
        UnmatchedFaces: [],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await primitives.client.send(new CompareFacesCommand({
    SourceImage: { S3Object: { Bucket: "b", Name: "source.jpg" } },
    TargetImage: { S3Object: { Bucket: "b", Name: "target.jpg" } },
  }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://rekognition.sa-east-1.amazonaws.com/");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(
    calls[0].options.headers["x-amz-target"],
    "RekognitionService.CompareFaces",
  );
  assert.match(calls[0].options.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//u);
  assert.equal(
    JSON.stringify(calls[0].options.headers).includes(ENV.AWS_SECRET_ACCESS_KEY),
    false,
  );
  assert.equal(result.FaceMatches[0].Similarity, 98.2);
});

test("native S3 transport signs PutObject and DeleteObject with path-safe keys", async () => {
  const calls = [];
  const primitives = createGlobalTrustFaceLabAwsSigV4Primitives({
    env: ENV,
    now: NOW,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response("", { status: 200 });
    },
  });

  const key = "trust-face-lab/sandbox/reference/ref 1.jpg";
  await primitives.s3Client.send(new PutObjectCommand({
    Bucket: "trust-sandbox",
    Key: key,
    Body: Buffer.from("reference"),
    ContentType: "image/jpeg",
  }));
  await primitives.s3Client.send(new DeleteObjectCommand({
    Bucket: "trust-sandbox",
    Key: key,
  }));

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, "PUT");
  assert.equal(calls[1].options.method, "DELETE");
  assert.match(calls[0].url, /\/trust-sandbox\/trust-face-lab\/sandbox\/reference\/ref%201\.jpg$/u);
  assert.match(calls[0].options.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//u);
  assert.equal(Buffer.from(calls[0].options.body).toString("utf8"), "reference");
  assert.equal(calls[1].options.body, undefined);
});

test("native transport fails closed before network when runtime credentials are absent", async () => {
  let calls = 0;
  const primitives = createGlobalTrustFaceLabAwsSigV4Primitives({
    env: {},
    now: NOW,
    fetchImpl: async () => {
      calls += 1;
      return new Response("", { status: 200 });
    },
  });

  await assert.rejects(
    primitives.client.send(new CompareFacesCommand({})),
    (error) => error?.code === "TRUST_FACE_LAB_AWS_CREDENTIALS_UNAVAILABLE",
  );
  assert.equal(calls, 0);
});
