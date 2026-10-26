// Pure, fail-closed StartBuildRequest serializer. No network, credentials, or executor.
const APP_TYPES = new Set([
  "create-react-app", "gatsby", "vite", "angular", "react", "vue", "parcel",
  "next", "nuxt", "nest", "express", "fastify", "astro", "svelte",
  "svelte-kit", "hono", "react-router", "nitro", "other"
]);
const PACKAGE_MANAGERS = new Set(["npm", "yarn", "pnpm"]);
const REQUIRED = [
  "node_version", "app_type", "root_directory", "output_directory",
  "build_script", "source_type", "source_options"
];
const OPTIONAL = ["entry_file", "package_manager"];
const own = (value, key) => Object.hasOwn(value, key);

function plainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`invalid_${name}`);
  }
  return value;
}
function exactKeys(value, permitted, name) {
  for (const key of Object.keys(value)) {
    if (!permitted.includes(key)) throw new Error(`unknown_${name}_field`);
  }
}
function bounded(value, name, max, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !value || value.trim() !== value ||
      value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`invalid_${name}`);
  }
  return value;
}
function relativePath(value, name, { nullable = false, archive = false } = {}) {
  const path = bounded(value, name, 200, { nullable });
  if (path === null) return null;
  if (path === "." && !archive) return path;
  if (path.startsWith("/") || path.includes("\\") || path.includes("?") ||
      path.includes("#") || path.includes("%") || path.includes(":") ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      !/^[a-zA-Z0-9_./-]+$/u.test(path) ||
      (archive && !/\.(zip|tar\.gz|tgz)$/iu.test(path))) {
    throw new Error(`invalid_${name}`);
  }
  return path;
}
function nullableChoice(value, name, allowed) {
  if (value === null) return null;
  if (!allowed.has(value)) throw new Error(`invalid_${name}`);
  return value;
}

/**
 * Builds a standalone, immutable, data-only dry-run preview for Hostinger
 * Hosting.V1.NodeJs.StartBuildRequest (OpenAPI 2.3.0).
 * Never calls assertHostingerNodeWriteAuthorization or performs any I/O.
 */
export function serializeHostingerNodeStartBuildDryRun(input) {
  plainObject(input, "start_build_input");
  exactKeys(input, [...REQUIRED, ...OPTIONAL], "start_build");
  for (const key of REQUIRED) {
    if (!own(input, key)) throw new Error(`missing_${key}`);
  }
  if (![18, 20, 22, 24].includes(input.node_version)) {
    throw new Error("invalid_node_version");
  }
  const sourceOptions = plainObject(input.source_options, "source_options");
  exactKeys(sourceOptions, ["archive_path"], "source_options");
  if (!own(sourceOptions, "archive_path")) throw new Error("missing_archive_path");
  if (input.source_type !== "archive") throw new Error("unsupported_source_type");
  const body = Object.freeze({
    node_version: input.node_version,
    app_type: nullableChoice(input.app_type, "app_type", APP_TYPES),
    root_directory: relativePath(input.root_directory, "root_directory", { nullable: true }),
    output_directory: relativePath(input.output_directory, "output_directory", { nullable: true }),
    build_script: bounded(input.build_script, "build_script", 64, { nullable: true }),
    source_type: "archive",
    source_options: Object.freeze({
      archive_path: relativePath(sourceOptions.archive_path, "archive_path", { archive: true })
    }),
    ...(own(input, "entry_file") ? {
      entry_file: relativePath(input.entry_file, "entry_file", { nullable: true })
    } : {}),
    ...(own(input, "package_manager") ? {
      package_manager: nullableChoice(input.package_manager, "package_MANAGERS)
    } : {})
  });
  return Object.freeze({
    mode: "dry-run",
    schema: "Hosting.V1.NodeJs.StartBuildRequest",
    writesEnabled: false,
    remoteBuildStarted: false,
    productionExecutionAllowed: false,
    body
  });
}
