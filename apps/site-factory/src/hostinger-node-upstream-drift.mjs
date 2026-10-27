// Read-only drift classifier; exact documented archive fields, no write authority.
const p = "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds";
const name = "Hosting.V1.NodeJs.StartBuildRequest";
const req = ["node_version","app_type","root_directory","output_directory","build_script","source_type","source_options"];
const apps = "create-react-app gatsby vite angular react vue parcel next nuxt nest express fastify astro svelte svelte-kit hono react-router nitro other".split(" ");
function same(a, b) {
  return Array.isArray(a) && a.length === b.length && new Set(a).size === b.length &&
    b.every(x => a.includes(x));
}
function str(f, max) {
  return f?.type === "string" && f.nullable === true && f.minLength === 1 && f.maxLength === max;
}
function compatible(s) {
  const f = s?.properties, o = f?.source_options;
  return s?.type === "object" && same(s.required, req) &&
    f?.node_version?.type === "integer" && same(f.node_version.enum, [18,20,22,24]) &&
    f?.app_type?.type === "string" && f.app_type.nullable === true && same(f.app_type.enum, apps) &&
    str(f.root_directory, 200) && str(f.output_directory, 200) && str(f.build_script, 64) &&
    str(f.entry_file, 200) && str(f.package_manager, 20) &&
    same(f.package_manager.enum, ["npm","yarn","pnpm"]) &&
    f?.source_type?.type === "string" && same(f.source_type.enum, ["archive","git"]) &&
    o?.type === "object" && o.nullable === true &&
    o.properties?.archive_path?.type === "string" &&
    (o.required === undefined || (Array.isArray(o.required) && o.required.every(x => x === "archive_path")));
}
export function classifyHostingerNodeArchiveDrift(openapi) {
  if (!openapi || typeof openapi !== "object" || Array.isArray(openapi)) throw Error("invalid_openapi");
  const legacyAvailable = Boolean(openapi.paths?.[`${p}/from-archive`]?.post);
  const op = openapi.paths?.[p]?.post;
  // The referenced schema must exist: checking only the $ref masks upstream breaking changes.
  const newArchiveFlowDocumented =
    op?.requestBody?.content?.["application/json"]?.schema?.$ref === `#/components/schemas/${name}` &&
    compatible(openapi.components?.schemas?.[name]);
  return Object.freeze({
    status: legacyAvailable ? "legacy-present-review-required" :
      newArchiveFlowDocumented ? "legacy-removed-new-contract-review-required" : "contract-unverified-blocked",
    legacyAvailable, newArchiveFlowDocumented,
    writesEnabled: false, productionExecutionAllowed: false, requiresManualReview: true,
    nextAction: "review_new_contract_and_migrate_planner_without_real_execution"
  });
}
