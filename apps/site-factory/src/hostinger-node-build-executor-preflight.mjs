import crypto from "node:crypto";

const SOURCE_SHA = "163ea5ccae5be6ecbb190100b99ee3425f0dc14d";
const SOURCE_RUN_ID = "30738206135";
const SOURCE_ARTIFACT_NAME =
  "site-factory-hostinger-node-archive-163ea5ccae5be6ecbb190100b99ee3425f0dc14d";
const SOURCE_ZIP_NAME =
  "site-factory-hostinger-node-source-163ea5ccae5be6ecbb190100b99ee3425f0dc14d.zip";
const TARGET_DOMAIN = "preview-apidevelopers.apidevelopers.digital";
const UPSTREAM_ISSUE_URL = "https://github.com/hostinger/api/issues/56";

export function createHostingerNodeBuildExecutorPreflight({
  generatedAt = new Date().toISOString(),
} = {}) {
  if (typeof generatedAt !== "string" || generatedAt.trim() === "") {
    throw new Error("missing_or_invalid:generatedAt");
  }

  const preflight = {
    schemaVersion: "1.0",
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
    officialApi: {
      method: "POST",
      endpoint:
        "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive",
      transportContractVerified: false,
      contentType: null,
      archiveFieldEncoding: null,
      upstreamBlocker: {
        repository: "hostinger/api",
        issueNumber: 56,
        issueUrl: UPSTREAM_ISSUE_URL,
        status: "open",
        reason: "archive_transport_contract_unverified",
      },
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
    blockReason: "official_archive_transport_contract_unverified",
    unblockRequirements: [
      "official_transport_contract_resolved_or_independently_verified",
      "new_executor_pull_request",
      "green_ci_and_security_review",
      "fresh_single_use_approval",
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
  SOURCE_ARTIFACT_NAME,
  SOURCE_RUN_ID,
  SOURCE_SHA,
  SOURCE_ZIP_NAME,
  TARGET_DOMAIN,
  UPSTREAM_ISSUE_URL,
};
