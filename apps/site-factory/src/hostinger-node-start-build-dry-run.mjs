// Pure Hostinger StartBuildRequest serializer; no network, credentials or execution.
const apps = new Set(("create-react-app gatsby vite angular react vue parcel next nuxt nest express fastify astro svelte svelte-kit hono react-router nitro other").split(" "));
const managers = new Set(["npm", "yarn", "pnpm"]);
const required = ["node_version", "app_type", "root_directory", "output_directory", "build_script", "source_type", "source_options"];
const own = (obj, key) => Object.hasOwn(obj, key);
function record(obj, name, keys) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(obj))) throw Error(`invalid_${name}`);
  if (Object.keys(obj).some((key) => !keys.includes(key))) throw Error(`unknown_${name}_field`);
}
function choice(value, name, allowed) {
  if (value !== null && !allowed.has(value)) throw Error(`invalid_${name}`);
  return value;
}
function string(value, name, max, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value || value.trim() !== value ||
      value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw Error(`invalid_${name}`);
  return value;
}
function path(value, name, nullable = false, archive = false) {
  const s = string(value, name, 200, nullable);
  if (s === null || (s === "." && !archive)) return s;
  if (!/^[a-zA-Z0-9_./-]+$/.test(s) || s.split("/").some((p) => !p || p === "." || p === "..") ||
      (archive && !/\.(zip|tgz|tar\.gz)$/i.test(s))) throw Error(`invalid_${name}`);
  return s;
}
export function serializeHostingerNodeStartBuildDryRun(input) {
  record(input, "start_build", [...required, "entry_file", "package_manager"]);
  for (const key of required) if (!own(input, key)) throw Error(`missing_${key}`);
  if (![18, 20, 22, 24].includes(input.node_version)) throw Error("invalid_node_version");
  record(input.source_options, "source_options", ["archive_path"]);
  if (!own(input.source_options, "archive_path")) throw Error("missing_archive_path");
  if (input.source_type !== "archive") throw Error("unsupported_source_type");
  const body = Object.freeze({
    node_version: input.node_version,
    app_type: choice(input.app_type, "app_type", apps),
    root_directory: path(input.root_directory, "root_directory", true),
    output_directory: path(input.output_directory, "output_directory", true),
    build_script: string(input.build_script, "build_script", 64, true),
    source_type: "archive",
    source_options: Object.freeze({ archive_path: path(input.source_options.archive_path, "archive_path", false, true) }),
    ...(own(input, "entry_file") ? { entry_file: path(input.entry_file, "entry_file", true) } : {}),
    ...(own(input, "package_manager") ? { package_manager: choice(input.package_manager, "package_manager", managers) } : {})
  });
  return Object.freeze({ mode: "dry-run", schema: "Hosting.V1.NodeJs.StartBuildRequest",
    writesEnabled: false, remoteBuildStarted: false, productionExecutionAllowed: false, body });
}
