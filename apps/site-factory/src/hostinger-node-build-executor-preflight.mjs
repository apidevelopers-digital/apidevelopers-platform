import crypto from "node:crypto";

const SOURCE_SHA = "163ea5ccae5be6ecbb190100b99ee3425f0dc14d";
const SOURCE_RUN_ID = "30738206135";
const SOURCE_ARTIFACT_NAME =
  "site-factory-hostinger-node-archive-163ea5ccae5be6ecbb190100b99ee3425f0dc14d";
const SOURCE_ZIP_NAME =
  "site-factory-hostinger-node-source-163ea5ccae5be6ecbb190100b99ee3425f0dc14d.zip";
const TARGET_DOMAIN = "preview-apidevelopers.apidevelopers.digital";

const HOSTINGER_OPENAPI_REPOSITORY = "hostinger/api";
const HOSTINGER_OPENAPI_PATH = "openapi.json";
const HOSTINGER_OPENAPI_VERSION = "3.0.0";
const HOSTINGER_API_VERSION = "1.23.0";
const HOSTINGER_ENDPOINT =
  "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive";
const HOSTINGER_OPERATION_ID = "hosting_createNodeJSBuildFromArchiveV1";
const HOSTINGER_REQUEST_MEDIA_TYPE = "application/json";
const HOSTINGER_REQUEST_SCHEMA = "Hosting.V1.NodeJs.CreateFromArchiveRequest";
const HOSTINGER_ARCHIVE_FIELD_TYPE = "string";
const HOSTINGER_ARCHIVE_FIELD_FORMAT = null;
const HOSTINGER_ARCHIVE_MAXIMUM_BYTES = 50 * 1024 * 1024;
const UPSTREAM_ISSUE_URL = "https://github.com/hostinger/api/issues/56";
const CONTRACT_SNAPSHOT_OBSERVED_AT = "2026-08-02";

export function createHostingerNodeBuildExecutorPreflight({
  generatedAt = new Date().toISOString(),
} = {}) {
  if (typeof generatedAt !== "string" || generatedAt.trim() === "") {
    throw new Error("missing_or_invalid:generatedAt");
  }

  const preflight = {
    schemaVersion: "1.1",
    kind: "site-factory-hostinger-node-build-executor-preflight",
    status: "blocked",
    mode: "dry-run",
    readyForApply: false,
    approvalRequired: true,
    singleUse: true,
    source: {
      repository: "apidevelopers-digital/apidevelopers-platform",
      sha: SOURCE_SHA,
      workflowRunId: SOURCE_RUN_ID,
      artifactName: SOURCE_ARTIFACT_NAME,
      archiveName: SOURCE_ZIP_NAME,
      archiveMetadataReadExternally: false,
    },
    target: {
      domain: TARGET_DOMAIN,
      runtime: "react-vite",
      nodeVersion: "22",
      packageManager: "npm",
      buildScript: "npm run build",
      outputDirectory: "dist",
      healthcheck: "/",
    },
    officialContractSnapshot: {
      repository: HOSTINGER_OPENAPI_REPOSITORY,
      path: HOSTINGER_OPENAPI_PATH,
      openapiVersion: HOSTINGER_OPENAPI_VERSION,
      apiVersion: HOSTINGER_API_VERSION,
      observedAt: CONTRACT_SNAPSHOT_OBSERVED_AT,
      endpoint: HOSTINGER_ENDPOINT,
      operationId: HOSTINGER_OPERATION_ID,
      requestMediaType: HOSTINGER_REQUEST_MEDIA_TYPE,
      requestSchema: HOSTINGER_REQUEST_SCHEMA,
      archiveField: {
        required: true,
        type: HOSTINGER_ARCHIVE_FIELD_TYPE,
        format: HOSTINGER_ARCHIVE_FIELD_FORMAT,
        maximumBytes: HOSTINGER_ARCHIVE_MAXIMUM_BYTES,
      },
      documentationSnapshotVerified: true,
      executableTransportVerified: false,
    },
    serverContractConflict: {
      issueRepository: HOSTINGER_OPENAPI_REPOSITORY,
      issueNumber: 56,
      issueUrl: UPSTREAM_ISSUE_URL,
      issueStateAtSnapshot: "open",
      documentedJsonStringResult: "reported_422_archive_must_be_file",
      documentedJsonBase64Result:
        "reported_422_archive_must_be_file_and_51200_character_limit",
      multipartFileResult:
        "reported_403_cloudflare_managed_challenge_before_api",
      independentSuccessfulRequestVerified: false,
    },
    releaseGuard: {
      expectedApiVersion: HOSTINGER_API_VERSION,
      expectedRequestMediaType: HOSTINGER_REQUEST_MEDIA_TYPE,
      expectedArchiveFieldType: HOSTINGER_ARCHIVE_FIELD_TYPE,
      officialContractChangeRequired: true,
      issueResolutionOrIndependentVerificationRequired: true,
      manualFlagUnlockAllowed: false,
      runtimeOverrideAllowed: false,
      requestBuilderPresent: false,
      executorPresent: false,
    },
    barriers: {
      requestPrepared: false,
      lockClaimEnabled: false,
      hostingerPostEnabled: false,
      buildPollingEnabled: false,
      deployEnabled: false,
      dnsEnabled: false,
      secretsRequired: [],
      hostingerTokenUsed: false,
    },
    blockReason: "official_contract_server_validation_conflict",
    unblockRequirements: [
      "official_openapi_contract_changes_or_transport_is_independently_verified",
      "upstream_issue_resolved_or_indepent_success_evidence_recorded",
      "new_executor_pull_request",
      "green_ci_and_security_review",
      "fresh_single_use_approval_bound_to_exact_sha_archive_and_contract_snapshot",
    ],
    generatedAt: generatedAt.trim(),
  };

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(preflight))
    .digest("hex");

  return Object.freeze({
    ...preflight,
    fingerprint,
  });
}

export {
  CONTRACT_SNAPSHOT_OBSERVED_AT,
  HOSTINGER_API_VERSION,
  HOSTINGER_ARCHIVE_FIELD_FORMAT,
  HOSTINGER_ARCHIVE_FIELD_TYPE,
  HOSTINGER_ARCHIVE_MAXIMUM_BYTES,
  HOSTINGER_ENDPOINT,
  HOSTINGER_OPENAPI_PATH,
  HOSTINGER_OPENAPI_REPOSITORY,
  HOSTINGER_OPENAPI_VERSION,
  HOSTINGER_OPERATION_ID,
  HOSTINGER_REQUEST_MEDIA_TYPE,
  HOSTINGER_REQUEST_SCHEMA,
  SOURCE_ARTIFACT_NAME,
  SOURCE_RUN_ID,
  SOURCE_SHA,
  SOURCE_ZIP_NAME,
  TARGET_DOMAIN,
  UPSTREAM_ISSUE_URL,
};
