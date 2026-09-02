import {
  createGitHubReadonlyClient,
} from "./operator-github-readonly-client.mjs";
import {
  createGitHubActionsEvidenceClient,
} from "./operator-github-actions-evidence-client.mjs";
import {
  normalizeOperatorSecretRef,
  requireOperatorSecretProvider,
} from "./operator-secret-provider-contract.mjs";

const ORGANIZATION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$/;

export class OperatorGitHubRuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OperatorGitHubRuntimeError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function positiveInteger(value, field, fallback, maximum) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new OperatorGitHubRuntimeError(
      "invalid_github_runtime_config",
      `${field} is invalid`,
      { field },
    );
  }
  return normalized;
}

export function resolveOperatorGitHubRuntimeConfig({ env = process.env } = {}) {
  const directToken = optionalText(env.OPERATOR_GITHUB_TOKEN);
  if (directToken) {
    throw new OperatorGitHubRuntimeError(
      "direct_github_token_forbidden",
      "OPERATOR_GITHUB_TOKEN is forbidden; use an opaque secret or vault reference",
      { field: "OPERATOR_GITHUB_TOKEN" },
    );
  }
  const organization = optionalText(env.OPERATOR_GITHUB_ORGANIZATION);
  const credentialRef = optionalText(env.OPERATOR_GITHUB_CREDENTIAL_REF);

  if (!organization && !credentialRef) {
    return Object.freeze({
      configured: false,
      reason: "github_readonly_not_configured",
    });
  }
  if (!organization || !credentialRef) {
    throw new OperatorGitHubRuntimeError(
      "incomplete_github_runtime_config",
      "GitHub readonly runtime requires organization and credential reference together",
      {
        organizationConfigured: Boolean(organization),
        credentialRefConfigured: Boolean(credentialRef),
      },
    );
  }
  if (!ORGANIZATION_PATTERN.test(organization)) {
    throw new OperatorGitHubRuntimeError(
      "invalid_github_runtime_config",
      "OPERATOR_GITHUB_ORGANIZATION is invalid",
      { field: "OPERATOR_GITHUB_ORGANIZATION" },
    );
  }
  return Object.freeze({
    configured: true,
    organization,
    credentialRef: normalizeOperatorSecretRef(credentialRef),
    apiBaseUrl:
      optionalText(env.OPERATOR_GITHUB_API_BASE_URL) ?? "https://api.github.com",
    timeoutMs: positiveInteger(
      env.OPERATOR_GITHUB_TIMEOUT_MS,
      "OPERATOR_GITHUB_TIMEOUT_MS",
      10_000,
      60_000,
    ),
  });
}

export function createOperatorGitHubRuntime({
  env = process.env,
  secretProvider,
  transport,
  clientFactory = createGitHubReadonlyClient,
  actionsEvidenceClientFactory = createGitHubActionsEvidenceClient,
} = {}) {
  if (typeof clientFactory !== "function") {
    throw new TypeError("clientFactory must be a function");
  }
  if (typeof actionsEvidenceClientFactory !== "function") {
    throw new TypeError("actionsEvidenceClientFactory must be a function");
  }

  const config = resolveOperatorGitHubRuntimeConfig({ env });
  if (!config.configured) {
    return Object.freeze({
      configured: false,
      descriptor: Object.freeze({
        configured: false,
        mode: "deny-by-default",
        reason: config.reason,
        productionChanged: false,
      }),
    });
  }

  const resolvedProvider = requireOperatorSecretProvider(secretProvider);
  if (typeof transport?.requestWithCredential !== "function") {
    throw new OperatorGitHubRuntimeError(
      "github_transport_unavailable",
      "GitHub readonly transport must be explicitly injected",
    );
  }

  const sharedClientOptions = Object.freeze({
    secretProvider: resolvedProvider,
    transport,
    credentialRef: config.credentialRef,
    apiBaseUrl: config.apiBaseUrl,
    timeoutMs: config.timeoutMs,
  });

  const readonlyClient = clientFactory(sharedClientOptions);
  const actionsEvidenceClient = actionsEvidenceClientFactory(sharedClientOptions);
  if (typeof actionsEvidenceClient?.getWorkflowRunEvidence !== "function") {
    throw new OperatorGitHubRuntimeError(
      "github_actions_evidence_client_unavailable",
      "GitHub Actions evidence client is unavailable",
    );
  }

  const client = Object.freeze({
    ...readonlyClient,
    getWorkflowRunEvidence:
      actionsEvidenceClient.getWorkflowRunEvidence.bind(actionsEvidenceClient),
  });

  return Object.freeze({
    configured: true,
    organization: config.organization,
    client,
    descriptor: Object.freeze({
      configured: true,
      mode: "readonly",
      organization: config.organization,
      credentialReferenceConfigured: true,
      directTokenAccepted: false,
      tokenMaterialLoadedDuringComposition: false,
      actionsEvidenceReadOnlyConfigured: true,
      productionChanged: false,
    }),
  });
}
