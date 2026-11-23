import { planHostingerNodeArchiveUpload } from "./hostinger-node-tus-plan.mjs";
import { createTusMockTransport, executeTusMockUpload } from "./hostinger-node-tus-transport.mjs";
import { createHostingerNodeContractTransitionReport } from "./hostinger-node-contract-transition.mjs";

// Functional dry-run entrypoint: validates contract, binds archive to build body,
// and exercises mock TUS PATCH requests. No fetch, credentials, POST or deploy.
export function runHostingerNodeArchiveDryRun({
  openapi, issue, observedAt, username, domain, archivePath,
  startBuildInput, bytes, chunkSize, responses, startOffset = 0,
} = {}) {
  const contract = createHostingerNodeContractTransitionReport({ openapi, issue, observedAt });
  if (!contract.changeSignals.currentArchiveFlowDocumented) {
    throw new Error("hostinger_node_contract_unverified");
  }
  const plan = planHostingerNodeArchiveUpload({ username, domain, archivePath, startBuildInput });
  if (!plan.buildPayloadValidated) throw new Error("hostinger_node_build_payload_required");
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error("invalid_archive_bytes");
  const transport = createTusMockTransport(responses);
  const transfer = executeTusMockUpload({ bytes, chunkSize, transport, startOffset });
  if (!transfer.complete) throw new Error("incomplete_mock_upload");

  return Object.freeze({
    mode: "dry-run",
    contractStatus: contract.status,
    reviewRequired: true,
    plan,
    transfer,
    writesEnabled: false,
    buildStartAllowed: false,
    remoteBuildStarted: false,
    productionExecutionAllowed: false,
  });
}
