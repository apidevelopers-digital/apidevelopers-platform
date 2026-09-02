import {
  normalizeOperatorSecretRef,
  requireOperatorSecretProvider,
  withOperatorSecret,
} from "./operator-secret-provider-contract.mjs";
import {
  buildGitHubActionsPaths,
  GitHubActionsEvidenceError,
  requireGitHubIdentifier,
  requireRunId,
  sanitizeAdaEvidenceAnnotations,
  sanitizeWorkflowJobs,
  sanitizeWorkflowRun,
} from "./operator-github-actions-evidence-contract.mjs";

const API_VERSION = "2022-11-28";

function requireTransport(value) {
  if (typeof value?.requestWithCredential !== "function") {
    throw new TypeError("transport.requestWithCredential must be a function");
  }
  return value;
}

function normalizeResponse(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new GitHubActionsEvidenceError("github_actions_transport_violation", "invalid GitHub response");
  }
  const status = Number(response.status);
  if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
    throw new GitHubActionsEvidenceError("github_actions_transport_violation", "invalid GitHub status");
  }
  if (status < 200 || status > 299) {
    throw new GitHubActionsEvidenceError("github_actions_request_failed", "GitHub Actions request failed", status);
  }
  let body = response.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > 1024 * 1024) throw new GitHubActionsEvidenceError("github_actions_contract_violation", "GitHub response too large");
    try { body = JSON.parse(body); } catch {
      throw new GitHubActionsEvidenceError("github_actions_contract_violation", "GitHub returned invalid JSON");
    }
  }
  if (body === null || typeof body !== "object") {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", "GitHub returned invalid body");
  }
  return body;
}

export function createGitHubActionsEvidenceClient({
  transport,
  secretProvider,
  credentialRef,
  apiBaseUrl = "https://api.github.com",
  timeoutMs = 10_000,
} = {}) {
  const resolvedTransport = requireTransport(transport);
  const provider = requireOperatorSecretProvider(secretProvider);
  const secretRef = normalizeOperatorSecretRef(credentialRef);
  const base = new URL(apiBaseUrl);
  if (base.protocol !== "https:" || base.hostname !== "api.github.com" || base.username || base.password || base.search || base.hash) {
    throw new TypeError("apiBaseUrl must be https://api.github.com");
  }
  const timeout = Number(timeoutMs);
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) throw new TypeError("timeoutMs is invalid");

  async function get(path, purpose, correlationId, tenantId) {
    return withOperatorSecret({
      secretProvider: provider,
      access: {
        secretRef,
        purpose,
        ...(correlationId ? { correlationId: String(correlationId) } : {}),
        ...(tenantId ? { tenantId: String(tenantId) } : {}),
      },
      consumer: async (lease) => {
        let response;
        try {
          response = await resolvedTransport.requestWithCredential({
            request: Object.freeze({
              method: "GET",
              url: `https://api.github.com${path}`,
              headers: Object.freeze({
                accept: "application/vnd.github+json",
                "x-github-api-version": API_VERSION,
                "user-agent": "api-developers-operator-gateway/0.1",
              }),
              timeoutMs: timeout,
            }),
            credential: Object.freeze({ scheme: "bearer", bytes: lease.bytes, ...(lease.version ? { version: lease.version } : {}) }),
          });
        } catch (error) {
          if (error instanceof GitHubActionsEvidenceError) throw error;
          throw new GitHubActionsEvidenceError("github_actions_transport_unavailable", "GitHub Actions transport is unavailable", 503);
        }
        return normalizeResponse(response);
      },
    });
  }

  return Object.freeze({
    async getWorkflowRunEvidence({ owner, repository, runId, correlationId, tenantId } = {}) {
      const safeOwner = requireGitHubIdentifier(owner, "owner");
      const safeRepo = requireGitHubIdentifier(repository, "repository");
      const safeRun = requireRunId(runId);
      const paths = buildGitHubActionsPaths({ owner: safeOwner, repository: safeRepo, runId: safeRun });

      const run = sanitizeWorkflowRun(
        await get(paths.run, "github.readonly.actions.workflow_run.get", correlationId, tenantId),
        { owner: safeOwner, repository: safeRepo, runId: safeRun },
      );
      const jobs = sanitizeWorkflowJobs(
        await get(paths.jobs, "github.readonly.actions.workflow_run.jobs.list", correlationId, tenantId),
      );

      const evidence = [];
      for (const job of jobs) {
        const annotationPath = buildGitHubActionsPaths({
          owner: safeOwner, repository: safeRepo, runId: safeRun, checkRunId: job.checkRunId,
        }).annotations;
        const annotations = await get(
          annotationPath,
          "github.readonly.actions.check_run.annotations.list",
          correlationId,
          tenantId,
        );
        evidence.push(...sanitizeAdaEvidenceAnnotations(annotations, job));
        if (evidence.length > 20) throw new GitHubActionsEvidenceError("github_actions_evidence_invalid", "too many ADA_EVIDENCE annotations");
      }

      return Object.freeze({
        repository: `${safeOwner}/${safeRepo}`,
        run,
        jobs,
        evidence: Object.freeze(evidence),
      });
    },
  });
}
