import crypto from "node:crypto";

const NODE_PATH = "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs";

export const EXPECTED = Object.freeze({
  issueNumber: 56,
  issueState: "closed",
  openapiVersion: "3.0.0",
  apiVersion: "2.1.0",
  uploadEndpoint: "/api/hosting/v1/files/upload-urls",
  uploadOperationId: "hosting_generateUploadURLV1",
  uploadSchema: "Hosting.V1.Files.GenerateUploadUrlRequest",
  buildEndpoint: `${NODE_PATH}/builds`,
  buildOperationId: "hosting_startNode.jsBuildV1",
  buildSchema: "Hosting.V1.NodeJs.StartBuildRequest",
  settingsEndpoint: `${NODE_PATH}/builds/settings/from-archive`,
  settingsOperationId: "hosting_getNode.jsBuildSettingsFromArchiveV1",
  legacyEndpoint: `${NODE_PATH}/builds/from-archive`,
});

const BUILD_FIELDS = [
  "node_version",
  "app_type",
  "root_directory",
  "output_directory",
  "build_script",
  "source_type",
  "source_options",
];
const UPLOAD_FIELDS = ["username", "domain"];

function requestSchemaRef(operation) {
  return operation?.requestBody?.content?.["application/json"]?.schema?.$ref;
}

function hasOnlyJsonBody(operation) {
  return Object.keys(operation?.requestBody?.content ?? {}).join() ===
    "application/json";
}

// A new mandatory parameter can break existing clients; fail closed on additions.
function exactRequiredFields(schema, expectedFields) {
  return Array.isArray(schema?.required) &&
    schema.required.length === expectedFields.length &&
    expectedFields.every((field) => schema.required.includes(field));
}

export function createHostingerNodeContractMonitorReport({
  openapi,
  issue,
  observedAt = new Date().toISOString(),
}) {
  if (!openapi || typeof openapi !== "object" || Array.isArray(openapi)) {
    throw new Error("missing_or_invalid:openapi");
  }
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
    throw new Error("missing_or_invalid:issue");
  }
  if (typeof observedAt !== "string" || !observedAt.trim()) {
    throw new Error("missing_or_invalid:observedAt");
  }

  const paths = openapi.paths ?? {};
  const schemas = openapi.components?.schemas ?? {};
  const upload = paths[EXPECTED.uploadEndpoint]?.post;
  const build = paths[EXPECTED.buildEndpoint]?.post;
  const settings = paths[EXPECTED.settingsEndpoint]?.get;
  const buildSchema = schemas[EXPECTED.buildSchema];
  const sourceOptions = buildSchema?.properties?.source_options;
  const archivePathParam = settings?.parameters?.find(
    (entry) => entry.name === "archive_path" && entry.in === "query",
  );

  const checks = {
    openapiVersionMatches: openapi.openapi === EXPECTED.openapiVersion,
    apiVersionMatches: openapi.info?.version === EXPECTED.apiVersion,
    legacyEndpointAbsent: !Object.hasOwn(paths, EXPECTED.legacyEndpoint),
    uploadOperationIdMatches:
      upload?.operationId === EXPECTED.uploadOperationId,
    uploadSchemaMatches:
      hasOnlyJsonBody(upload) &&
      requestSchemaRef(upload) === `#/components/schemas/${EXPECTED.uploadSchema}` &&
      Boolean(schemas[EXPECTED.uploadSchema]),
    uploadRequiredFieldsMatch:
      exactRequiredFields(schemas[EXPECTED.uploadSchema], UPLOAD_FIELDS),
    buildOperationIdMatches: build?.operationId === EXPECTED.buildOperationId,
    buildSchemaMatches:
      build?.requestBody?.required === true &&
      hasOnlyJsonBody(build) &&
      requestSchemaRef(build) === `#/components/schemas/${EXPECTED.buildSchema}`,
    buildRequiredFieldsMatch: exactRequiredFields(buildSchema, BUILD_FIELDS),
    sourceTypeIncludesArchive:
      buildSchema?.properties?.source_type?.enum?.includes("archive") === true,
    archivePathIsString: sourceOptions?.properties?.archive_path?.type === "string",
    settingsOperationIdMatches:
      settings?.operationId === EXPECTED.settingsOperationId,
    settingsArchivePathRequired:
      archivePathParam?.required === true && archivePathParam?.schema?.type === "string",
    issueNumberMatches: Number(issue.number) === EXPECTED.issueNumber,
    issueStateMatches: issue.state === EXPECTED.issueState,
  };

  const contractChanged = Object.keys(checks).some(
    (name) =>
      !["apiVersionMatches", "issueNumberMatches", "issueStateMatches"].includes(name) &&
      checks[name] !== true,
  );
  const issueChanged = !checks.issueNumberMatches || !checks.issueStateMatches;
  const apiVersionChanged = !checks.apiVersionMatches;
  const reviewRequired = contractChanged || issueChanged;

  const report = {
    schemaVersion: "2.0",
    kind: "site-factory-hostinger-node-contract-monitor",
    status: reviewRequired
      ? "review-required"
      : apiVersionChanged
        ? "upstream-metadata-changed-blocked"
        : "unchanged-blocked",
    reviewRequired,
    expected: EXPECTED,
    observed: {
      openapiVersion: openapi.openapi ?? null,
      apiVersion: openapi.info?.version ?? null,
      issueNumber: Number(issue.number),
      issueState: issue.state ?? null,
      issueUrl: issue.html_url ?? null,
    },
    checks,
    changeSignals: {
      contractChanged,
      issueChanged,
      apiVersionChanged,
      officialIssueClosed: issue.state === "closed",
    },
    barriers: {
      hostingerTokenUsed: false,
      hostingerRequestPrepared: false,
      hostingerPostExecuted: false,
      remoteBuildStarted: false,
      deployExecuted: false,
      dnsChanged: false,
    },
    nextAction: reviewRequired
      ? "open_review_pull_request_before_any_executor_change"
      : "keep_executor_blocked_and_continue_monitoring",
    observedAt: observedAt.trim(),
  };
  return Object.freeze({
    ...report,
    fingerprint: crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex"),
  });
}
