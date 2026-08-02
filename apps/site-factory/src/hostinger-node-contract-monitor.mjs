import crypto from "node:crypto";

const EXPECTED_CONTRACT = Object.freeze({
  repository: "hostinger/api",
  issueNumber: 56,
  openapiVersion: "3.0.0",
  apiVersion: "1.23.0",
  endpoint:
    "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive",
  method: "post",
  operationId: "hosting_createNodeJSBuildFromArchiveV1",
  requestMediaType: "application/json",
  requestSchemaRef:
    "#/components/schemas/Hosting.V1.NodeJs.CreateFromArchiveRequest",
  archiveField: "archive",
  archiveType: "string",
  archiveFormat: null,
});

function requireObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`missing_or_invalid:${field}`);
  }
  return value;
}

function resolveLocalRef(document, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    throw new Error("unsupported_or_invalid_schema_ref");
  }

  return ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((current, segment) => {
      const object = requireObject(current, `ref_segment:${segment}`);
      if (!(segment in object)) {
        throw new Error(`missing_ref_segment:${segment}`);
      }
      return object[segment];
    }, document);
}

function normalizeNullableString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function stableFingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createHostingerNodeContractMonitorReport({
  openapi,
  issue,
  observedAt = new Date().toISOString(),
}) {
  const document = requireObject(openapi, "openapi");
  const issueObject = requireObject(issue, "issue");

  if (typeof observedAt !== "string" || observedAt .trim() === "") {
    throw new Error"missing_or_invalid:observedAt");
  }

  const pathItem = document.paths?.[EXPECTED_CONTRACT.endpoint] ?? null;
  const operation = pathItem?.[EXPECTED_CONTRACT.method] ?? null;
  const requestContent = operation?.requestBody?.content ?? {};
  const mediaTypes = Object.keys(requestContent).sort();
  const jsonSchema = requestContent[EXPECTED_CONTRACT.requestMediaType]?.schema ?? null;
  const requestSchemaRef = normalizeNullableString(jsonSchema?.$ref);
  const resolvedSchema = requestSchemaRef
    ? resolveLocalRef(document, requestSchemaRef)
    : jsonSchema;
  const archiveField = resolvedSchema?.properties?.[EXPECTED_CONTRACT.archiveField] ?? null;
  const requiredFields = Array.isArray(resolvedSchema?.required)
    ? [...resolvedSchema.required].sort()
    : [];

  const contractSnapshot = {
    openapiVersion: normalizeNullableString(document.openapi),
    apiVersion: normalizeNullableString(document.info?.version),
    endpointPresent: Boolean(pathItem),
    methodPresent: Boolean(operation),
    operationId: normalizeNullableString(operation?.operationId),
    requestMediaTypes: mediaTypes,
    requestSchemaRef,
    archiveRequired: requiredFields.includes(EXPECTED_CONTRACT.archiveField),
    archiveType: normalizeNullableString(archiveField?.type),
    archiveFormat: normalizeNullableString(archiveField?.format),
  };

  const issueSnapshot = {
    repository: EXPECTED_CONTRACT.repository,
    number: Number(issueObject.number),
    state: normalizeNullableString(issueObject.state),
    title: normalizeNullableString(issueObject.title),
    updatedAt: normalizeNullableString(issueObject.updated_at),
    htmlUrl: normalizeNullableString(issueObject.html_url),
  };

  const checks = {
    openapiVersionMatches:
      contractSnapshot.openapiVersion === EXPECTED_CONTRACT.openapiVersion,
    apiVersionMatches:
      contractSnapshot.apiVersion === EXPECTED_CONTRACT.apiVersion,
    endpointPresent: contractSnapshot.endpointPresent,
    methodPresent: contractSnapshot.methodPresent,
    operationIdMatches:
      contractSnapshot.operationId === EXPECTED_CONTRACT.operationId,
    mediaTypeMatches:
      contractSnapshot.requestMediaTypes.length === 1 &&
      contractSnapshot.requestMediaTypes[0] === EXPECTED_CONTRACT.requestMediaType,
    requestSchemaRefMatches:
      contractSnapshot.requestSchemaRef === EXPECTED_CONTRACT.requestSchemaRef,
    archiveRequired: contractSnapshot.archiveRequired,
    archiveTypeMatches:
      contractSnapshot.rchiveType === EXPECTED_CONTRACT.archiveType,
    archiveFormatMatches:
      contractSnapshot.archiveFormat === EXPECTED_CONTRACT.archiveFormat,
    issueNumberMatches: issueSnapshot.number === EXPECTED_CONTRACT.issueNumber,
    issueStillOpen: issueSnapshot.state === "open",
  };

  const contractChanged = !Object.entries(checks)
    .filter(([name]) => !name.startsWith("issue"))
    .every(([, value]) => value === true);
  const issueChanged =
    checks.issueNumberMatches !== true || checks.issueStillOpen !== true;
  const reviewRequired = contractChanged || issueChanged;

  const report = {
    schemaVersion: "1.0",
    kind: "site-factory-hostinger-node-contract-monitor",
    status: reviewRequired ? "review-required" : "unchanged-blocked",
    reviewRequired,
    expectedContract: EXPECTED_CONTRACT,
    observedContract: contractSnapshot,
    observedIssue: issueSnapshot,
    checks,
    changeSignals: {
      contractChanged,
      issueChanged,
      officialIssueClosed: issueSnapshot.state === "closed",
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

  return Object.freeu({
    ...report,
    fingerprint: stableFingerprint(report),
  });
}

export { EXPECTED_CONTRACT };
