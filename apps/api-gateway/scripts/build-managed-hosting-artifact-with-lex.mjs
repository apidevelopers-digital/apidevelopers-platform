import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildManagedHostingArtifact } from "./build-managed-hosting-artifact.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const APP_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const REPOSITORY_ROOT = resolve(APP_DIRECTORY, "../..");
const LEX_PACKAGE_DIRECTORY = join(REPOSITORY_ROOT, "packages", "lex-legal-runtime");
const EXPECTED_LEX_SOURCE_SHA = "a32f20f8fe7d4197eab8168a990846e2b89a8048";
const LEX_VENDOR_DIRECTORY = "vendor/lex-legal-runtime";
const EMBEDDED_FACADE = "src/mitra-embedded-professional-facade.mjs";
const PACKAGE_IMPORT = '"@apidevelopers/lex-legal-runtime"';
const ARTIFACT_IMPORT = '"../vendor/lex-legal-runtime/src/index.js"';

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
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) {
        throw new TypeError(`managed artifact cannot contain symlink: ${path}`);
      }
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new TypeError(`unsupported managed artifact entry: ${path}`);
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

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readLexSourceSha() {
  const provenance = await readFile(
    join(LEX_PACKAGE_DIRECTORY, "src", "provenance.js"),
    "utf8",
  );
  const match = provenance.match(
    /LEX_SOURCE_SHA\s*=\s*"([0-9a-f]{40})"/,
  );
  if (!match) throw new TypeError("Lex provenance must expose a 40-character source SHA");
  if (match[1] !== EXPECTED_LEX_SOURCE_SHA) {
    throw new TypeError(`Lex provenance mismatch: expected ${EXPECTED_LEX_SOURCE_SHA}, got ${match[1]}`);
  }
  const snapshot = JSON.parse(
    await readFile(join(LEX_PACKAGE_DIRECTORY, "SNAPSHOT_VERIFIED.json"), "utf8"),
  );
  if (snapshot.verified !== true || snapshot.path_count !== 14 || snapshot.source_sha !== EXPECTED_LEX_SOURCE_SHA) {
    throw new TypeError("Lex snapshot verification marker is missing or inconsistent");
  }
  return match[1];
}

async function vendorLexRuntime(outputDirectory) {
  const destination = join(outputDirectory, ...LEX_VENDOR_DIRECTORY.split("/"));
  const metadata = JSON.parse(
    await readFile(join(LEX_PACKAGE_DIRECTORY, "package.json"), "utf8"),
  );
  if (metadata.name !== "@apidevelopers/lex-legal-runtime") {
    throw new TypeError("unexpected Lex runtime package metadata");
  }

  await mkdir(destination, { recursive: true });
  await cp(
    join(LEX_PACKAGE_DIRECTORY, "src"),
    join(destination, "src"),
    { recursive: true },
  );
  await writeJson(join(destination, "package.json"), {
    name: metadata.name,
    version: metadata.version,
    private: true,
    type: metadata.type ?? "module",
    description: metadata.description,
    exports: metadata.exports,
    engines: metadata.engines,
  });

  const facadePath = join(outputDirectory, ...EMBEDDED_FACADE.split("/"));
  const facade = await readFile(facadePath, "utf8");
  if (!facade.includes(PACKAGE_IMPORT)) {
    throw new TypeError("embedded Mitra facade must import the Lex runtime package");
  }
  await writeFile(
    facadePath,
    facade.replace(PACKAGE_IMPORT, ARTIFACT_IMPORT),
    "utf8",
  );

  return Object.freeze({
    name: metadata.name,
    version: metadata.version,
    directory: LEX_VENDOR_DIRECTORY,
    distribution: "embedded-relative-import",
    sourceRevision: await readLexSourceSha(),
  });
}

async function refreshManifest(outputDirectory, lexDependency) {
  const manifestPath = join(outputDirectory, "release-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const dependencies = [
    ...(manifest.dependencies ?? []).filter(
      (entry) => entry.name !== lexDependency.name,
    ),
    lexDependency,
  ].sort((left, right) => left.name.localeCompare(right.name));

  const files = [];
  for (const path of await listFiles(outputDirectory)) {
    if (resolve(path) === resolve(manifestPath)) continue;
    files.push(await describeFile(outputDirectory, path));
  }
  files.sort((left, right) => left.path.localeCompare(right.path));

  const updated = Object.freeze({
    ...manifest,
    dependencies: Object.freeze(dependencies),
    files: Object.freeze(files),
  });
  await writeJson(manifestPath, updated);
  return updated;
}

export async function buildManagedHostingArtifactWithLex(options = {}) {
  const result = await buildManagedHostingArtifact(options);
  const lexDependency = await vendorLexRuntime(result.outputDirectory);
  const manifest = await refreshManifest(result.outputDirectory, lexDependency);
  return Object.freeze({
    outputDirectory: result.outputDirectory,
    manifest,
  });
}

async function main() {
  const result = await buildManagedHostingArtifactWithLex();
  console.log(
    JSON.stringify({
      event: "api_gateway_managed_artifact_with_lex_created",
      service: result.manifest.service,
      version: result.manifest.version,
      sourceRevision: result.manifest.sourceRevision,
      files: result.manifest.files.length,
      dependencies: result.manifest.dependencies.length,
      lexSourceRevision: result.manifest.dependencies.find(
        (entry) => entry.name === "@apidevelopers/lex-legal-runtime",
      )?.sourceRevision,
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
        event: "api_gateway_managed_artifact_with_lex_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
