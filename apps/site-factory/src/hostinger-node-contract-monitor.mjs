import crypto from "node:crypto";

const EXPECTED = Object.freeze({
  issueNumber: 56,
  openapiVersion: "3.0.0",
  apiVersion: "1.30.0",
  endpoint:
    "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive",
  operationId: "hosting_createNodeJSBuildFromArchiveV1",
  mediaType: "application/json",
  schemaName: "Hosting.V1.NodeJs.CreateFromArchiveRequest",
});

const CONTRACT_CHECK_NAMES = Object.freeze([
  "openapiVersionMatches",
  "endpointPresent",
  "operationIdMatches",
  "mediaTypeMatches",
  "schemaRefMatches",
  "archiveRequired",
  "archiveTypeMatches",
  "archiveFormatAbsent",
]);

function valueOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createHostingerNodeContractMonitorReport({
  openapi,
  issue,
  observedAt = new Date().toISOString(),
}) {
  if (!openapi || typeof openapi !== "object") {
    throw new Error("missing_or_invalid:openapi");
  }
  if (!issue || typeof issue !== "object") {
    throw new Error("missing_or_invalid:issue");
  }
  if (!valueOrNull(observedAt)) {
    throw new Error("missing_or_invalid:observedAt");
  }

  const operation = openapi.paths?.[EXPECTED.endpoint]?.post ?? null;
  const mediaTypes = Object.keys(operation?.requestBody?.content ?? {}).sort();
  const requestSchemaRef =
    operation?.requestBody?.content?.[EXPECTED.mediaType]?.schema?.$ref ?? null;
  const schema = openapi.components?.schemas?.[EXPECTED.schemaName] ?? null;
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const archive = schema?.properties?.archive ?? null;

  const checks = {
    openapiVersionMatches: openapi.openapi === EXPECTED.openapiVersion,
    apiVersionMatches: openapi.info?.version === EXPECTED.apiVersion,
    endpointPresent: Boolean(openapi.paths?.[EXPECTED.endpoint]),
    operationIdMatches: operation?.operationId === EXPECTED.operationId,
    mediaTypeMatches:
      mediaTypes.length === 1 && mediaTypes[0] === EXPECTED.mediaType,
    schemaRefMatches:
      requestSchemaRef === `#/components/schemas/${EXPECTED.schemaName}`,
    archiveRequired: required.includes("archive"),
    archiveTypeMatches: archive?.type === "string",
    archiveFormatAbsent: archive?.format == null,
    issueNumberMatches: Number(issue.number) === EXPECTED.issueNumber,
    issueStillOpen: issue.state === "open",
  };

  const contractChanged = CONTRACT_CHECK_NAMES.some(
    (name) => checks[name] !== true,
  );
  const apiVersionChanged = checks.apiVersionMatches !== true;
  const issueChanged =
    checks.issueNumberMatches !== true || checks.issueStillOpen !== true;
  const reviewRequired = contractChanged || issueChanged;

  const report = {
    schemaVersion: "1.1",
    kind: "site-factory-hostinger-node-contract-monitor",
    status: reviewRequired
      ? "review-required"
      : apiVersionChanged
        ? "upstream-metadata-changed-blocked"
        : "unchanged-blocked",
    reviewRequired,
    expected: EXPECTED,
    observed: {
      openapiVersion: valueOrNull(openapi.openapi),
      apiVersion: valueOrNull(openapi.info?.version),
      operationId: valueOrNull(operation?.operationId),
      mediaTypes,
      requestSchemaRef: valueOrNull(requestSchemaRef),
      archiveRequired: required.includes("archive"),
      archiveType: valueOrNull(archive?.type),
      archiveFormat: valueOrNull(archive?.format),
      issueNumber: Number(issue.number),
      issueState: valueOrNull(issue.state),
      issueUpdatedAt: valueOrNull(issue.updated_at),
      issueUrl: valueOrNull(issue.html_url),
    },
    checks,
    changeSignals: {
      contractChanged,
      apiVersionChanged,
      issueChanged,
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
      : apiVersionChanged
        ? "record_global_api_version_drift_and_continue_monitoring"
        : "keep_executor_blocked_and_continue_monitoring",
    observedAt: observedAt.trim(),
  };

  return Object.freeze({ ...report, fingerprint: digest(report) });
}

export { EXPECTED, CONTRACT_CHECK_NAMES };
