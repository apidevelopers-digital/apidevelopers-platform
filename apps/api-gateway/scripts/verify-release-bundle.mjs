import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BUNDLE_DIRECTORY = resolve(
  SCRIPT_DIRECTORY,
  "../dist/api-gateway",
);

function portablePath(value) {
  return value.split(sep).join("/");
}

async function listFiles(root) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      } else {
        throw new TypeError(`unsupported release entry: ${path}`);
      }
    }
  }

  await visit(root);
  return files;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function verifyReleaseManifest({
  bundleDirectory = DEFAULT_BUNDLE_DIRECTORY,
} = {}) {
  const root = resolve(bundleDirectory);
  const manifest = JSON.parse(
    await readFile(join(root, "release-manifest.json"), "utf8"),
  );

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.service, "api-gateway");
  assert.equal(manifest.runtime.entrypoint, "src/operational-server.mjs");
  assert.deepEqual(manifest.configuration.required, [
    "API_GATEWAY_STATE_FILE",
  ]);

  const actualFiles = (await listFiles(root))
    .map((path) => portablePath(relative(root, path)))
    .filter((path) => path !== "release-manifest.json")
    .sort();
  const expectedFiles = manifest.files.map((entry) => entry.path).sort();
  assert.deepEqual(actualFiles, expectedFiles);

  for (const entry of manifest.files) {
    const path = join(root, ...entry.path.split("/"));
    const metadata = await stat(path);
    assert.equal(metadata.size, entry.bytes, `size mismatch: ${entry.path}`);
    assert.equal(
      await sha256(path),
      entry.sha256,
      `checksum mismatch: ${entry.path}`,
    );
  }

  return manifest;
}

function waitForStart(child, timeoutMs = 10_000) {
  return new Promise((resolveStart, rejectStart) => {
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      rejectStart(new Error(`operational bundle startup timed out: ${stderr}`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    };

    const onStderr = (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    };

    const onExit = (code, signal) => {
      cleanup();
      rejectStart(
        new Error(
          `operational bundle exited before startup: code=${code} signal=${signal} stderr=${stderr}`,
        ),
      );
    };

    const onStdout = (chunk) => {
      stdout += chunk;
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.event === "api_gateway_operational_started") {
          cleanup();
          resolveStart(event);
          return;
        }
      }
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
  });
}

function waitForExit(child, timeoutMs = 10_000) {
  return new Promise((resolveExit, rejectExit) => {
    const timeout = setTimeout(() => {
      rejectExit(new Error("operational bundle shutdown timed out"));
    }, timeoutMs);

    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolveExit({ code, signal });
    });
  });
}

async function getJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return {
    response,
    body: await response.json(),
  };
}

export async function smokeReleaseBundle({
  bundleDirectory = DEFAULT_BUNDLE_DIRECTORY,
} = {}) {
  const root = resolve(bundleDirectory);
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "api-gateway-release-verify-"),
  );
  const stateFilePath = join(temporaryDirectory, "state.json");
  const child = spawn(
    process.execPath,
    [join(root, "src/operational-server.mjs")],
    {
      cwd: root,
      env: {
        API_GATEWAY_STATE_FILE: stateFilePath,
        API_GATEWAY_ADMIN_KEY: "release-verification-non-production",
        HOST: "127.0.0.1",
        PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    const started = await waitForStart(child);
    assert.equal(started.mode, "operational");
    assert.equal(started.stateStore, "json-file");
    assert.equal(started.adminKeyConfigured, true);
    assert.equal(typeof started.port, "number");

    const baseUrl = `http://127.0.0.1:${started.port}`;

    const health = await getJson(baseUrl, "/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.body.status, "ok");

    const readiness = await getJson(baseUrl, "/ready");
    assert.equal(readiness.response.status, 200);
    assert.equal(readiness.body.status, "ready");
    assert.equal(readiness.body.checks[0].name, "persistence");
    assert.equal(readiness.body.checks[0].status, "ok");

    const openApi = await getJson(baseUrl, "/openapi.json");
    assert.equal(openApi.response.status, 200);
    assert.equal(openApi.body.openapi, "3.1.0");

    const unauthorized = await getJson(baseUrl, "/v1/whoami");
    assert.equal(unauthorized.response.status, 401);
    assert.equal(unauthorized.body.error, "unauthorized");

    child.kill("SIGTERM");
    const exited = await waitForExit(child);
    assert.equal(exited.code, 0);

    return Object.freeze({
      status: "passed",
      checks: Object.freeze([
        "manifest",
        "checksums",
        "health",
        "readiness",
        "openapi",
        "authentication_boundary",
        "shutdown",
      ]),
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function verifyReleaseBundle(options = {}) {
  const manifest = await verifyReleaseManifest(options);
  const smoke = await smokeReleaseBundle(options);
  return Object.freeze({ manifest, smoke });
}

async function main() {
  const result = await verifyReleaseBundle();
  console.log(
    JSON.stringify({
      event: "api_gateway_release_bundle_verified",
      service: result.manifest.service,
      version: result.manifest.version,
      sourceRevision: result.manifest.sourceRevision,
      checks: result.smoke.checks,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        event: "api_gateway_release_bundle_verification_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
