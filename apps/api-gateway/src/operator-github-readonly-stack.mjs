import { createGitHubReadonlyAdapters } from "./operator-github-readonly-adapter.mjs";
import { createGitHubReadonlyClient } from "./operator-github-readonly-client.mjs";
import { createOperatorHttpsCredentialTransport } from "./operator-https-credential-transport.mjs";
import { createOperatorHttpsEgressPolicy } from "./operator-https-egress-policy.mjs";
import { createOperatorVaultSecretProvider } from "./operator-vault-secret-provider.mjs";

const ORGANIZATION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

function requireOrganization(value) {
  const organization = String(value ?? "").trim();
  if (!ORGANIZATION_PATTERN.test(organization)) {
    throw new TypeError("organization must be a valid GitHub organization identifier");
  }
  return organization;
}

function requireHttpsBaseUrl(value) {
  const url = new URL(String(value ?? "https://api.github.com"));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  ) {
    throw new TypeError(
      "apiBaseUrl must be an HTTPS origin without credentials, path, query or fragment",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return Object.freeze({
    value: url.toString().replace(/\/$/, ""),
    hostname: url.hostname.toLowerCase(),
    port: Number(url.port || 443),
  });
}

export function createOperatorGitHubReadonlyStack({
  vaultClient,
  fetchImpl,
  credentialRef,
  organization,
  apiBaseUrl = "https://api.github.com",
  timeoutMs = 10_000,
  maxResponseBytes = 1024 * 1024,
  now = () => new Date(),
  maxLeaseLifetimeMs,
} = {}) {
  const resolvedOrganization = requireOrganization(organization);
  const resolvedBaseUrl = requireHttpsBaseUrl(apiBaseUrl);

  const secretProvider = createOperatorVaultSecretProvider({
    vaultClient,
    allowedSecretRefs: [credentialRef],
    now,
    ...(maxLeaseLifetimeMs !== undefined ? { maxLeaseLifetimeMs } : {}),
  });

  const egressPolicy = createOperatorHttpsEgressPolicy({
    allowedHosts: [resolvedBaseUrl.hostname],
    allowedPorts: [resolvedBaseUrl.port],
    allowedMethods: ["GET"],
    allowedPathPrefixes: ["/orgs/", "/repos/"],
    allowedQueryKeys: ["page", "per_page", "type"],
  });

  const transport = createOperatorHttpsCredentialTransport({
    fetchImpl,
    policy: egressPolicy,
    maxResponseBytes,
  });

  const client = createGitHubReadonlyClient({
    transport,
    secretProvider,
    credentialRef,
    apiBaseUrl: resolvedBaseUrl.value,
    timeoutMs,
  });

  const adapters = createGitHubReadonlyAdapters({
    client,
    organization: resolvedOrganization,
    now,
  });

  return Object.freeze({
    secretProvider,
    egressPolicy,
    transport,
    client,
    adapters,
    descriptor: Object.freeze({
      provider: "github",
      mode: "read-only",
      organization: resolvedOrganization,
      credentialConfigured: true,
      runtimeActivated: false,
      productionChanged: false,
    }),
  });
}
