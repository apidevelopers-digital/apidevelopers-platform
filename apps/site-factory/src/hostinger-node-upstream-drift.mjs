// Read-only contract-shape classification. Never authorizes an upstream write.
const legacyPath = "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive";
const currentPath = "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds";
const schemaName = "Hosting.V1.NodeJs.StartBuildRequest";
const requiredFields = ["node_version", "app_type", "root_directory", "output_directory",
  "build_script", "source_type", "source_options"];
const appTypes = "create-react-app gatsby vite angular react vue parcel next nuxt nest express fastify astro svelte svelte-kit hono react-router nitro other".split(" ");

function sameMembers(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    new Set(actual).size === expected.length && expected.every((value) => actual.includes(value));
}

function nullableString(field, maxLength) {
  return field?.type === "string" && field.nullable === true &&
    field.minLength === 1 && field.maxLength === maxLength;
}

function archiveBuildSchemaCompatible(schema) {
  const fields = schema?.properties;
  const options = fields?.source_options;
  return schema?.type === "object" &&
    sameMembers(schema.required, requiredFields) &&
    fields?.node_version?.type === "integer" &&
    sameMembers(fields.node_version.enum, [18, 20, 22, 24]) &&
    fields?.app_type?.type === "string" && fields.app_type.nullable === true &&
    sameMembers(fields.app_type.enum, appTypes) &&
    nullableString(fields.root_directory, 200) &&
    nullableString(fields.output_directory, 200) &&
    nullableString(fields.build_script, 64) &&
    nullableString(fields.entry_file, 200) &&
    nullableString(fields.package_manager, 20) &&
    sameMembers(fields.package_manager.enum, ["npm", "yarn", "pnpm"]) &&
    fields?.source_type?.type === "string" &&
    sameMembers(fields.source_type.enum, ["archive", "git"]) &&
    options?.type === "object" && options.nullable === true &&
    options.properties?.archive_path?.type === "string" &&
    (options.required === undefined ||
      (Array.isArray(options.required) && options.required.every((name) => name === "archive_path")));
}

export function classifyHostingerNodeArchiveDrift(openapi) {
  if (!openapi || typeof openapi !== "object" || Array.isArray(openapi)) throw new Error("invalid_openapi");
  const legacyAvailable = Boolean(openapi.paths?.[legacyPath]?.post);
  const currentOperation = openapi.paths?.[currentPath]?.post;
  const referenceMatches = currentOperation?.requestBody?.content?.["application/json"]?.schema?.$ref ===
    `#/components/schemas/${schemaName}`;
  // A matching $ref is not enough: the referenced schema must exist and match the dry-run serializer.
  const newArchiveFlowDocumented = referenceMatches &&
    archiveBuildSchemaCompatible(openapi.components?.schemas?.[schemaName]);
  return Object.freeze({
    status: legcyAvailable ? "legacy-present-review-required" :
      newArchiveFlowDocumented ? "legacy-removed-new-contract-review-required" : "contract-unverified-blocked",
    legacyAvailable,
    newArchiveFlowDocumented,
    writesEnabled: false,
    productionExecutionAllowed: false,
    requiresManualReview: true,
    nextAction: "review_new_contract_and_migrate_planner_without_real_execution"
  });
}
