import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  cp,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ARTIFACT_DIRECTORY = resolve(
  SCRIPT_DIRECTORY,
  "../dist/api-gateway-managed",
);
const EXPECTED_DEPENDENCIES = Object.freeze({
  "@apidevelopers/auth-core": "file:vendor/auth-core",
  "@apidevelopers/apikey-core": "file:vendor/apikey-core",
  "@apidevelopers/contracts": "file:vendor/contracts",
  "@apidevelopers/persistence-core": "file:vendor/persistence-core",
  "@apidevelopers/saas-runtime": "file:vendor/saas-runtime",
});

function portablePath(value) {
  return value.split(sep).join("/");
}

async function listFiles(root, { excludeNodeModules = false } = {}) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (excludeNodeModules && entry.isDirectory() && entry.name === "node_modules") {
        continue;
      }

      const path = join(directory, entry.name);
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) {
        throw new TypeError(`artifact cannot contain symlink: ${path}`);
      }
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      } else {
        throw new TypeError(`unsupported artifact entry: ${path}`);
      }
    }
  }

  await visit(root);
  return files;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function assertNoRegistryReference(value, label) {
  const serialized = JSON.stringify(value);
  assert.equal(
    serialized.includes("registry.npmjs.org"),
    false,
    `${label} must not depend on the public npm registry`,
  );
}

export async function verifyManagedHostingManifest({
  artifactDirectory = DEFAULT_ARTIFACT_DIRECTORY,
} = {}) {
  const root = resolve(artifactDirectory);
  const manifest = JSON.parse(
    await readFile(join(root, "release-manifest.json"), "utf8"),
  );
  const packageMetadata = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const lockMetadata = JSON.parse(
    await readFile(join(root, "package-lock.json"), "utf8"),
  );

  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.format, "managed-node-zip");
  assert.equal(manifest.service, "api-gateway");
  assert.equal(manifest.runtime.node, ">=22");
  assert.equal(
    manifest.runtime.entrypoint,
    "src/operational-server.mjs",
  );
  assert.equal(manifest.runtime.startCommand, "npm start");
  assert.equal(manifest.runtime.expectedPort, 3000);

  assert.equal(packageMetadata.name, "@apidevelopers/api-gateway-managed");
  assert.equal(packageMetadata.private, true);
  assert.equal(packageMetadata.type, "module");
  assert.equal(
    packageMetadata.scripts.start,
    "node src/operational-server.mjs",
  );
  assert.deepEqual(packageMetadata.dependencies, EXPECTED_DEPENDENCIES);
  assert.deepEqual(
    lockMetadata.packages?.[""]?.dependencies,
    EXPECTED_DEPENDENCIES,
  );
  assertNoRegistryReference(packageMetadata, "package.json");
  assertNoRegistryReference(lockMetadata, "package-lock.json");

  const actualFiles = (await listFiles(root))
    .map((path) => portablePath(relative(root, path)))
    .filter((path) => path !== "release-manifest.json")
    .sort();
  const expectedFiles = manifest.files.map((entry) => entry.path).sort();
  assert.deepEqual(actualFiles, expectedFiles);

  for (const path of actualFiles) {
    assert.equal(path.split("/").includes("node_modules"), false);
    assert.equal(path === ".env" || path.endsWith("/.env"), false);
    assert.equal(path.endsWith(".env"), false);
    assert.equal(path === "state.json" || path.endsWith("/state.json"), false);
  }

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

  for (const [name, dependencyPath] of Object.entries(EXPECTED_DEPENDENCIES)) {
    const directory = dependencyPath.replace(/^file:/, "");
    const vendorMetadata = JSON.parse(
      await readFile(join(root, directory, "package.json"), "utf8"),
    );
    assert.equal(vendorMetadata.name, name);
    assert.equal(vendorMetadata.private, true);
    assert.equal(vendorMetadata.devDependencies, undefined);
    assert.equal(vendorMetadata.scripts, undefined);

    for (const dependency of Object.values(vendorMetadata.dependencies ?? {})) {
      if (typeof dependency === "string" && dependency.startsWith("file:")) {
        assert.match(dependency, /^file:\.\.\/[a-z0-9-]+$/);
      }
    }
  }

  return Object.freeze({
    root,
    manifest,
    packageMetadata,
    lockMetadata,
  });
}

async function installWithoutRegistry(sourceDirectory, destinationDirectory) {
  await cp(sourceDirectory, destinationDirectory, { recursive: true });
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const cacheDirectory = join(destinationDirectory, ".npm-offline-cache");

  try {
    await execFileAsync(
      npmCommand,
      [
        "install",
        "--omit=dev",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--offline",
      ],
      {
        cwd: destinationDirectory,
        env: {
          ...process.env,
          NODE_ENV: "production",
          npm_config_cache: cacheDirectory,
          npm_config_update_notifier: "false",
        },
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  } catch (error) {
    const detail = [error?.message, error?.stdout, error?.stderr]
      .filter(Boolean)
      .join("\n");
    throw new Error(`managed artifact offline install failed: ${detail}`);
  } finally {
    await rm(cacheDirectory, { recursive: true, force: true });
  }

  for (const name of Object.keys(EXPECTED_DEPENDENCIES)) {
    await stat(
      join(destinationDirectory, "node_modules", ...name.split("/"), "package.json"),
    );
  }
}

function waitForStart(child, timeoutMs = 15_000) {
  return new Promise((resolveStart, rejectStart) => {
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      cleanup();
      rejectStart(
        new Error(`managed runtime startup timed out: ${stderr || stdout}`),
      );
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    };

    const onStderr = (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8_000);
    };

    const onExit = (code, signal) => {
      cleanup();
      rejectStart(
        new Error(
          `managed runtime exited before startup: code=${code} signal=${signal} stderr=${stderr}`,
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
          resolveStart(Object.freeze({ event, stdout, stderr }));
          return;
        }
      }
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
  });
}

function waitForExit(child, timeoutMs = 15_000) {
  return new Promise((resolveExit, rejectExit) => {
    const timeout = setTimeout(() => {
      rejectExit(new Error("managed runtime shutdown timed out"));
    }, timeoutMs);

    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolveExit(Object.freeze({ code, signal }));
    });
  });
}

async function getJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return Object.freeze({
    status: response.status,
    body: await response.json(),
  });
}

export async function smokeManagedHostingArtifact({
  artifactDirectory = DEFAULT_ARTIFACT_DIRECTORY,
} = {}) {
  const verification = await verifyManagedHostingManifest({
    artifactDirectory,
  });
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "api-gateway-managed-artifact-"),
  );
  const installedDirectory = join(temporaryDirectory, "application");
  const stateFile = join(temporaryDirectory, "state", "gateway.json");
  const adminKey = "managed-artifact-verification-non-production";
  let child;

  try {
    await installWithoutRegistry(verification.root, installedDirectory);

    child = spawn(
      process.execPath,
      [join(installedDirectory, "src/operational-server.mjs")],
      {
        cwd: installedDirectory,
        env: {
          ...process.env,
          NODE_ENV: "production",
          API_GATEWAY_STATE_FILE: stateFile,
          API_GATEWAY_ADMIN_KEY: adminKey,
          HOST: "127.0.0.1",
          PORT: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const started = await waitForStart(child);
    assert.equal(started.event.mode, "operational");
    assert.equal(started.event.stateStore, "json-file");
    assert.equal(started.event.adminKeyConfigured, true);
    assert.equal(typeof started.event.port, "number");

    const baseUrl = `http://127.0.0.1:${started.event.port}`;
    const health = await getJson(baseUrl, "/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.status, "ok");

    const readiness = await getJson(baseUrl, "/ready");
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.status, "ready");

    const openApi = await getJson(baseUrl, "/openapi.json");
    assert.equal(openApi.status, 200);
    assert.equal(openApi.body.openapi, "3.1.0");
    assert.ok(openApi.body.paths["/health"]);
    assert.ok(openApi.body.paths["/ready"]);
    assert.ok(openApi.body.paths["/v1/whoami"]);

    const unauthorized = await getJson(baseUrl, "/v1/whoami");
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.body.error, "unauthorized");

    const exitPromise = waitForExit(child);
    child.kill("SIGTERM");
    const exited = await exitPromise;
    assert.equal(exited.code, 0);

    const allLogs = `${started.stdout}\n${started.stderr}`;
    assert.equal(allLogs.includes(adminKey), false);
    assert.equal(allLogs.includes(stateFile), false);

    return Object.freeze({
      status: "passed",
      checks: Object.freeze([
        "manifest",
        "checksums",
        "no_node_modules",
        "offline_install",
        "health",
        "readiness",
        "openapi",
        "authentication_boundary",
        "shutdown",
      ]),
    });
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function verifyManagedHostingArtifact(options = {}) {
  const manifest = await verifyManagedHostingManifest(options);
  const smoke = await smokeManagedHostingArtifact(options);
  return Object.freeze({ manifest: manifest.manifest, smoke });
}

async function main() {
  const result = await verifyManagedHostingArtifact();
  console.log(
    JSON.stringify({
      event: "api_gateway_managed_artifact_verified",
      service: result.manifest.service,
      version: result.manifest.version,
      sourceRevision: result.manifest.sourceRevision,
      checks: result.smoke.checks,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        event: "api_gateway_managed_artifact_verification_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
