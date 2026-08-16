import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = new URL(".", import.meta.url);
const DEFAULT_ARTIFACT_DIRECTORY = resolve(
  fileURLToPath(SCRIPT_DIRECTORY),
  "../dist/api-gateway-managed",
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

function rewriteOperationalServerImport(source, label) {
  const rewritten = source.replace(
    '"./operational-server.mjs"',
    '"./operational-server-runtime.mjs"',
  );
  if (rewritten === source) {
    throw new TypeError(
      `${label} did not reference ./operational-server.mjs as expected`,
    );
  }
  return rewritten;
}

export async function applyHostingerFixedEntryCompatibility({
  artifactDirectory = DEFAULT_ARTIFACT_DIRECTORY,
} = {}) {
  const root = resolve(artifactDirectory);
  const serverPath = join(root, "src", "operational-server.mjs");
  const runtimePath = join(root, "src", "operational-server-runtime.mjs");
  const hostingerEntryPath = join(root, "src", "hostinger-entry.mjs");
  const webAgentStartupPath = join(
    root,
    "src",
    "web-agent-operational-startup.mjs",
  );
  const manifestPath = join(root, "release-manifest.json");

  const originalServer = await readFile(serverPath, "utf8");
  await writeFile(runtimePath, originalServer, "utf8");

  const hostingerEntry = await readFile(hostingerEntryPath, "utf8");
  await writeFile(
    hostingerEntryPath,
    rewriteOperationalServerImport(hostingerEntry, "Hostinger entrypoint"),
    "utf8",
  );

  const webAgentStartup = await readFile(webAgentStartupPath, "utf8");
  await writeFile(
    webAgentStartupPath,
    rewriteOperationalServerImport(webAgentStartup, "Web Agent startup"),
    "utf8",
  );

  await writeFile(
    serverPath,
    'import "./hostinger-entry.mjs";\n',
    "utf8",
  );

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const files = await listFiles(root);
  const describedFiles = [];
  for (const path of files) {
    if (portablePath(relative(root, path)) === "release-manifest.json") continue;
    describedFiles.push(await describeFile(root, path));
  }
  describedFiles.sort((left, right) => left.path.localeCompare(right.path));

  manifest.files = describedFiles;
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return Object.freeze({
    artifactDirectory: root,
    compatibilityEntrypoint: "src/operational-server.mjs",
    runtimeModule: "src/operational-server-runtime.mjs",
    managedEntrypoint: "src/hostinger-entry.mjs",
  });
}

async function main() {
  const result = await applyHostingerFixedEntryCompatibility();
  console.log(
    JSON.stringify({
      event: "api_gateway_hostinger_fixed_entry_compatibility_applied",
      ...result,
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
        event: "api_gateway_hostinger_fixed_entry_compatibility_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
