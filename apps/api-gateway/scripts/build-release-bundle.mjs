import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_APP_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const DEFAULT_REPOSITORY_ROOT = resolve(DEFAULT_APP_DIRECTORY, "../..");
const DEPENDENCY_DIRECTORIES = Object.freeze([
  "contracts",
  "auth-core",
  "apikey-core",
  "persistence-core",
]);

function portablePath(value) {
  return value.split(sep).join("/");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
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

async function describeFile(root, path) {
  const [content, metadata] = await Promise.all([readFile(path), stat(path)]);
  return Object.freeze({
    path: portablePath(relative(root, path)),
    bytes: metadata.size,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}

async function copyPackage({ source, destination }) {
  const metadata = await readJson(join(source, "package.json"));
  if (typeof metadata.name !== "string" || !metadata.name.startsWith("@apidevelopers/")) {
    throw new TypeError(`invalid institutional package metadata: ${source}`);
  }

  await mkdir(destination, { recursive: true });
  await cp(join(source, "package.json"), join(destination, "package.json"));
  await cp(join(source, "src"), join(destination, "src"), { recursive: true });
  return metadata;
}

export async function buildReleaseBundle({
  appDirectory = DEFAULT_APP_DIRECTORY,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  outputDirectory = resolve(appDirectory, "dist/api-gateway"),
  sourceRevision = process.env.GITHUB_SHA ?? "local",
} = {}) {
  const resolvedAppDirectory = resolve(appDirectory);
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const resolvedOutputDirectory = resolve(outputDirectory);

  const appPackage = await readJson(join(resolvedAppDirectory, "package.json"));
  if (appPackage.name !== "@apidevelopers/api-gateway") {
    throw new TypeError("release bundle source must be @apidevelopers/api-gateway");
  }

  await rm(resolvedOutputDirectory, { recursive: true, force: true });
  await mkdir(resolvedOutputDirectory, { recursive: true });

  await cp(
    join(resolvedAppDirectory, "package.json"),
    join(resolvedOutputDirectory, "package.json"),
  );
  await cp(
    join(resolvedAppDirectory, "src"),
    join(resolvedOutputDirectory, "src"),
    { recursive: true },
  );

  const packagedDependencies = [];
  for (const directory of DEPENDENCY_DIRECTORIES) {
    const source = join(resolvedRepositoryRoot, "packages", directory);
    const metadata = await copyPackage({
      source,
      destination: join(
        resolvedOutputDirectory,
        "node_modules",
        "@apidevelopers",
        directory,
      ),
    });
    packagedDependencies.push(
      Object.freeze({
        name: metadata.name,
        version: metadata.version,
      }),
    );
  }

  const files = await listFiles(resolvedOutputDirectory);
  const describedFiles = [];
  for (const path of files) {
    describedFiles.push(await describeFile(resolvedOutputDirectory, path));
  }
  describedFiles.sort((left, right) => left.path.localeCompare(right.path));
  packagedDependencies.sort((left, right) => left.name.localeCompare(right.name));

  const manifest = Object.freeze({
    schemaVersion: 1,
    service: "api-gateway",
    version: appPackage.version,
    sourceRevision: String(sourceRevision),
    runtime: Object.freeze({
      node: appPackage.engines?.node ?? ">=22",
      entrypoint: "src/operational-server.mjs",
    }),
    configuration: Object.freeze({
      required: Object.freeze(["API_GATEWAY_STATE_FILE"]),
      optional: Object.freeze([
        "API_GATEWAY_ADMIN_KEY",
        "HOST",
        "PORT",
      ]),
    }),
    dependencies: Object.freeze(packagedDependencies),
    files: Object.freeze(describedFiles),
  });

  await writeFile(
    join(resolvedOutputDirectory, "release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return Object.freeze({
    outputDirectory: resolvedOutputDirectory,
    manifest,
  });
}

async function main() {
  const result = await buildReleaseBundle();
  console.log(
    JSON.stringify({
      event: "api_gateway_release_bundle_created",
      service: result.manifest.service,
      version: result.manifest.version,
      sourceRevision: result.manifest.sourceRevision,
      files: result.manifest.files.length,
      dependencies: result.manifest.dependencies.length,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        event: "api_gateway_release_bundle_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
