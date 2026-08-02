import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createNodeBuildFromArchive,
  createSanitizedRequestPreview,
  inspectArchive,
  listNodeBuilds,
} from "../src/hostinger-node-build-api-only.mjs";

async function tempArchive(content = "zip-content") {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hostinger-api-only-"));
  const archivePath = path.join(directory, "project.zip");
  await fs.writeFile(archivePath, content);
  return { directory, archivePath };
}

test("inspectArchive returns deterministic metadata without exposing contents", async () => {
  const { directory, archivePath } = await tempArchive("abc");
  try {
    const result = await inspectArchive(archivePath);
    assert.equal(result.name, "project.zip");
    assert.equal(result.bytes, 3);
    assert.equal(
      result.sha256,
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("preflight request preview is sanitized and bound to target", async () => {
  const { directory, archivePath } = await tempArchive();
  try {
    const archive = await inspectArchive(archivePath);
    const preview = createSanitizedRequestPreview({
      username: "u123",
      domain: "preview.example.com",
      archive,
      transport: "multipart",
      appType: "vite",
      nodeVersion: 22,
      outputDirectory: "dist",
      buildScript: "build",
      packageManager: "npm",
    });
    assert.equal(preview.method, "POST");
    assert.match(preview.url, /u123\/websites\/preview\.example\.com/);
    assert.equal(preview.archive.contentIncludedInEvidence, false);
    assert.equal(JSON.stringify(preview).includes("zip-content"), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("multipart create sends a file and never sets multipart boundary manually", async () => {
  const { directory, archivePath } = await tempArchive();
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(
      JSON.stringify({ uuid: "build-1", state: "pending" }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const result = await createNodeBuildFromArchive({
      token: "top-secret",
      username: "u123",
      domain: "preview.example.com",
      archivePath,
      transport: "multipart",
      fetchImpl,
    });
    assert.equal(result.uuid, "build-1");
    assert.equal(captured.options.method, "POST");
    assert.ok(captured.options.body instanceof FormData);
    assert.equal(captured.options.headers["content-type"], undefined);
    assert.equal(JSON.stringify(result).includes("top-secret"), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("failed create captures sanitized status and correlation id", async () => {
  const { directory, archivePath } = await tempArchive();
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        error: "invalid token top-secret",
        correlation_id: "corr-123",
      }),
      {
        status: 422,
        headers: { "content-type": "application/json" },
      },
    );

  try {
    await assert.rejects(
      createNodeBuildFromArchive({
        token: "top-secret",
        username: "u123",
        domain: "preview.example.com",
        archivePath,
        transport: "multipart",
        fetchImpl,
      }),
      (error) => {
        assert.equal(error.message, "hostinger_create_build_failed:422");
        const serialized = JSON.stringify(error.evidence);
        assert.equal(serialized.includes("top-secret"), false);
        assert.match(serialized, /corr-123/);
        return true;
      },
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("listNodeBuilds normalizes data envelope", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({ data: [{ uuid: "build-1", state: "completed" }] }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  const result = await listNodeBuilds({
    token: "secret",
    username: "u123",
    domain: "preview.example.com",
    fetchImpl,
  });
  assert.equal(result.builds.length, 1);
  assert.equal(result.builds[0].state, "completed");
});
