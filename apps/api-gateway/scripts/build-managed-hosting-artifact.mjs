import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_APP_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const DEFAULT_REPOSITORY_ROOT = resolve(DEFAULT_APP_DIRECTORY, "../..");
const DEFAULT_OUTPUT_DIRECTORY = resolve(
  DEFAULT_APP_DIRECTORY,
  "dist/api-gateway-managed",
);
const INTERNAL_PACKAGES = Object.freeze([
  Object.freeze({ directory: "contracts", name: "@apidevelopers/contracts" }),
  Object.freeze({ directory: "auth-core", name: "@apidevelopers/auth-core" }),
  Object.freeze({ directory: "apikey-core", name: "@apidevelopers/apikey-core" }),
  Object.freeze({
    directory: "persistence-core",
    name: "@apidevelopers/persistence-core",
  }),
  Object.freeze({
    directory: "saas-runtime",
    name: "@apidevelopers/saas-runtime",
  }),
  Object.freeze({
    directory: "trust-governance-runtime",
    name: "@apidevelopers/trust-governance-runtime",
  }),
  Object.freeze({
    directory: "kernel-planning",
    name: "@apidevelopers/kernel-planning",
  }),
  Object.freeze({
    directory: "kernel-decision",
    name: "@apidevelopers/kernel-decision",
  }),
  Object.freeze({
    directory: "kernel-policy",
    name: "@apidevelopers/kernel-policy",
  }),
  Object.freeze({
    directory: "kernel-runtime",
    name: "@apidevelopers/kernel-runtime",
  }),
  Object.freeze({
    directory: "kernel-evidence",
    name: "@apidevelopers/kernel-evidence",
  }),
  Object.freeze({
    directory: "kernel-audit",
    name: "@apidevelopers/kernel-audit",
  }),
]);
const DIRECTORY_BY_PACKAGE = Object.freeze(
  Object.fromEntries(INTERNAL_PACKAGES.map((entry) => [entry.name, entry.directory])),
);

function portablePath(value) {
  return value.split(sep).join("/");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function listFiles(root) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const path = join(directory, entry.name);
      const metadata = await lstat(path);

      if (metadata.isSymbolicLink()) {
        throw new TypeError(`managed artifact cannot contain symlink: ${path}`);
      }

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      } else {
        throw new TypeError(`unsupported managed artifact entry: ${path}`);
      }
    }
  }

  await visit(root);
  return files;
}

async function describeFile(root, path) {
  const content = await readFile(path);
  return Object.freeze({
    path: portablePath(relative(root, path)),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}

function localizeDependencies(metadata) {
  const localized = {};

  for (const [name, version] of Object.entries(metadata.dependencies ?? {})) {
    const dependencyDirectory = DIRECTORY_BY_PACKAGE[name];
    localized[name] = dependencyDirectory
      ? `file:../${dependencyDirectory}`
      : version;
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(localized).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

function createVendorPackageMetadata(metadata, packageDirectory) {
  if (
    typeof metadata.name !== "string" ||
    DIRECTORY_BY_PACKAGE[metadata.name] !== packageDirectory
  ) {
    throw new TypeError(
      `unexpected institutional package metadata for vendor/${packageDirectory}`,
    );
  }

  const localizedDependencies = localizeDependencies(metadata);
  const output = {
    name: metadata.name,
    version: metadata.version,
    private: true,
    type: metadata.type ?? "module",
  };

  if (metadata.description) output.description = metadata.description;
  if (metadata.exports) output.exports = metadata.exports;
  if (metadata.engines) output.engines = metadata.engines;
  if (Object.keys(localizedDependencies).length > 0) {
    output.dependencies = localizedDependencies;
  }

  return Object.freeze(output);
}

async function copyVendorPackage({
  repositoryRoot,
  outputDirectory,
  directory,
  name,
}) {
  const sourceDirectory = join(repositoryRoot, "packages", directory);
  const destinationDirectory = join(outputDirectory, "vendor", directory);
  const sourceMetadata = await readJson(join(sourceDirectory, "package.json"));

  if (sourceMetadata.name !== name) {
    throw new TypeError(
      `package mismatch for ${directory}: expected ${name}, got ${sourceMetadata.name}`,
    );
  }

  await mkdir(destinationDirectory, { recursive: true });
  await cp(join(sourceDirectory, "src"), join(destinationDirectory, "src"), {
    recursive: true,
  });

  const packagedMetadata = createVendorPackageMetadata(sourceMetadata, directory);
  await writeJson(join(destinationDirectory, "package.json"), packagedMetadata);

  return Object.freeze({
    name,
    version: sourceMetadata.version,
    directory: `vendor/${directory}`,
  });
}

async function generatePackageLock(outputDirectory) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const cacheDirectory = join(outputDirectory, ".npm-lock-cache");

  try {
    await execFileAsync(
      npmCommand,
      [
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--offline",
      ],
      {
        cwd: outputDirectory,
        env: {
          ...process.env,
          npm_config_cache: cacheDirectory,
          npm_config_update_notifier: "false",
        },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
  } catch (error) {
    const detail = [error?.message, error?.stdout, error?.stderr]
      .filter(Boolean)
      .join("\n");
    throw new Error(`managed artifact lock generation failed: ${detail}`);
  } finally {
    await rm(cacheDirectory, { recursive: true, force: true });
    await rm(join(outputDirectory, "node_modules"), {
      recursive: true,
      force: true,
    });
  }
}

export async function buildManagedHostingArtifact({
  appDirectory = DEFAULT_APP_DIRECTORY,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  outputDirectory = DEFAULT_OUTPUT_DIRECTORY,
  sourceRevision = process.env.GITHUB_SHA ?? "local",
} = {}) {
  const resolvedAppDirectory = resolve(appDirectory);
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const resolvedOutputDirectory = resolve(outputDirectory);
  const appMetadata = await readJson(
    join(resolvedAppDirectory, "package.json"),
  );

  if (appMetadata.name !== "@apidevelopers/api-gateway") {
    throw new TypeError(
      "managed artifact source must be @apidevelopers/api-gateway",
    );
  }

  await rm(resolvedOutputDirectory, { recursive: true, force: true });
  await mkdir(resolvedOutputDirectory, { recursive: true });
  await cp(
    join(resolvedAppDirectory, "src"),
    join(resolvedOutputDirectory, "src"),
    { recursive: true },
  );

  const packagedDependencies = [];
  for (const definition of INTERNAL_PACKAGES) {
    packagedDependencies.push(
      await copyVendorPackage({
        repositoryRoot: resolvedRepositoryRoot,
        outputDirectory: resolvedOutputDirectory,
        ...definition,
      }),
    );
  }
  packagedDependencies.sort((left, right) => left.name.localeCompare(right.name));

  const rootDependencies = Object.freeze(
    Object.fromEntries(
      packagedDependencies.map((entry) => [
        entry.name,
        `file:${entry.directory}`,
      ]),
    ),
   );

  const managedPackage = Object.freeze({
    name: "@apidevelopers/api-gateway-managed",
    version: appMetadata.version,
    private: true,
    type: "module",
    engines: Object.freeze({ node: ">=22" }),
    scripts: Object.freeze({
      start: "node src/hostinger-entry.mjs",
    }),
    dependencies: rootDependencies,
  });
  await writeJson(
    join(resolvedOutputDirectory, "package.json"),
    managedPackage,
  );

  await generatePackageLock(resolvedOutputDirectory);

  const files = await listFiles(resolvedOutputDirectory);
  const describedFiles = [];
  for (const path of files) {
    describedFiles.push(
      await describeFile(resolvedOutputDirectory, path),
   );
  }
  describedFiles.sort((left, right) => left.path.localeCompare(right.path));

  const manifest = Object.freeze({
    schemaVersion: 2,
    format: "managed-node-zip",
    service: "api-gateway",
    version: appMetadata.version,
    sourceRevision: String(sourceRevision),
    runtime: Object.freeze({
      node: ">=22",
      entrypoint: "src/hostinger-entry.mjs",
      startCommand: "npm start",
      expectedPort: 3000,
    }),
    configuration: Object.freeze({
      required: Object.freeze(["API_GATEWAY_STATE_FILE"]),
      optional: Object.freeze([
        "API_GATEWAY_ADMIN_KEY",
        "API_GATEWAY_OPERATOR_KEY",
        "API_GATEWAY_OPERATOR_TENANT_ID",
        "HOST",
        "PORT",
      ]),
    }),
    dependencies: Object.freeze(packagedDependencies),
    files: Object.freeze(describedFiles),
  });

  await writeJson(
    join(resolvedOutputDirectory, "release-manifest.json"),
    manifest,
  );

  return Object.freeze({
    outputDirectory: resolvedOutputDirectory,
    manifest,
  });
}

async function main() {
  const result = await buildManagedHostingArtifact();
  console.log(
    JSON.stringify({
      event: "api_gateway_managed_artifact_created",
      service: result.manifest.service,
      version: result.manifest.version,
      sourceRevision: result.manifest.sourceRevision,
      files: result.manifest.files.length,
      dependencies: result.manifest.dependencies.length,
      format: result.manifest.format,
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
        event: "api_gateway_managed_artifact_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
