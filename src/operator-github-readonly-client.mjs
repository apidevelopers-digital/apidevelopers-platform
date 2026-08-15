import {
  OperatorSecretContractError,
  normalizeOperatorSecretRef,
  requireOperatorSecretProvider,
  withOperatorSecret,
} from "./operator-secret-provider-contract.mjs";

const API_VERSION = "2022-11-28";
const MAX_BODY_BYTES = 1024 * 1024;
const IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export class GitHubReadonlyClientError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "GitHubReadonlyClientError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

function requireTransport(transport) {
  if (typeof transport?.requestWithCredential !== "function") {
    throw new TypeError("transport.requestWithCredential must be a function");
  }
  return transport;
}

function requiredIdentifier(value, field) {
  const normalized = String(value ?? "").trim();
  if (!IDENTIFIER.test(normalized)) {
    throw new GitHubReadonlyClientError("invalid_github_request", `${field} is invalid`);
  }
  return normalized;
}

function optionalRequestId(value, field) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim();
  if (!REQUEST_ID.test(normalized)) {
    throw new GitHubReadonlyClientError("invalid_github_request", `${field} is invalid`);
  }
  return normalized;
}

function positiveInteger(value, field, maximum) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new GitHubReadonlyClientError("invalid_github_request", `${field} is invalid`);
  }
  return normalized;
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value ?? "https://api.github.com"));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(
      "apiBaseUrl must be HTTPS without credentials, query or fragment",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function buildUrl(baseUrl, path, query = {}) {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function responseHeader(headers, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === wanted) return String(value);
  }
  return undefined;
}

function nextPageFromHeaders(headers) {
  const link = responseHeader(headers, "link");
  if (!link) return undefined;

  for (const entry of link.split(",")) {
    if (!/;\s*rel="?next"?\s*$/i.test(entry.trim())) continue;
    const match = entry.match(/[?&]page=([1-9][0-9]{0,4})(?:[&>])/);
    if (match) return Number(match[1]);
  }

  return undefined;
}

function parseBody(body) {
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new GitHubReadonlyClientError(
        "github_contract_violation",
        "GitHub response exceeded the allowed size",
        502,
      );
    }

    try {
      return JSON.parse(body);
    } catch {
      throw new GitHubReadonlyClientError(
        "github_contract_violation",
        "GitHub returned invalid JSON",
        502,
      );
    }
  }

  if (body === null || typeof body !== "object") {
    throw new GitHubReadonlyClientError(
      "github_contract_violation",
      "GitHub returned an invalid response body",
      502,
    );
  }

  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
    throw new GitHubReadonlyClientError(
      "github_contract_violation",
      "GitHub response exceeded the allowed size",
      502,
    );
  }

  return body;
}

function normalizeResponse(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new GitHubReadonlyClientError(
      "github_transport_violation",
      "GitHub transport returned an invalid response",
      502,
    );
  }

  const status = Number(response.status);
  if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
    throw new GitHubReadonlyClientError(
      "github_transport_violation",
      "GitHub transport returned an invalid status",
      502,
    );
  }

  if (status < 200 || status > 299) {
    throw new GitHubReadonlyClientError(
      "github_request_failed",
      "GitHub request failed",
      status,
    );
  }

  return Object.freeze({
    status,
    headers:
      response.headers && typeof response.headers === "object"
        ? Object.freeze({ ...response.headers })
        : Object.freeze({}),
    body: parseBody(response.body),
  });
}

function sanitizeOrganization(body, expectedOrganization) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GitHubReadonlyClientError(
      "github_contract_violation",
      "GitHub returned an invalid organization",
      502,
    );
  }

  const login = requiredIdentifier(body.login, "organization.login");
  if (login.toLowerCase() !== expectedOrganization.toLowerCase()) {
    throw new GitHubReadonlyClientError(
      "github_contract_violation",
      "GitHub returned an unexpected organization",
      502,
    );
  }

  return Object.freeze({ login });
}

function sanitizeRepository(body, expectedOwner, expectedName) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GitHubReadonlyClientError(
      "github_contract_violation",
      "GitHub returned an invalid repository",
      502,
    );
  }

  const name = requiredIdentifier(body.name, "repository.name");
  const fullName = String(body.full_name ?? "").trim();
  const expectedFullName = `${expectedOwner}/${expectedName}`;

  if (
    name.toLowerCase() !== expectedName.toLowerCase() ||
    fullName.toLowerCase() !== expectedFullName.toLowerCase()
  ) {
    throw new GitHubReadonlyClientError(
      "github_contract_violation",
      "GitHub returned an unexpected repository",
      502,
    );
  }

  return Object.freeze({
    name,
    full_name: fullName,
    archived: body.archived === true,
    disabled: body.disabled === true,
  });
}

export function createUnavailableGitHubReadonlyTransport() {
  return Object.freeze({
    async requestWithCredential() {
      throw new GitHubReadonlyClientError(
        "github_transport_unavailable",
        "GitHub transport is unavailable",
        503,
      );
    },
  });
}

export function createGitHubReadonlyClient({
  transport,
  secretProvider,
  credentialRef,
  apiBaseUrl = "https://api.github.com",
  timeoutMs = 10_000,
} = {}) {
  const resolvedTransport = requireTransport(transport);
  const resolvedProvider = requireOperatorSecretProvider(secretProvider);
  const resolvedCredentialRef = normalizeOperatorSecretRef(credentialRef);
  const resolvedBaseUrl = normalizeBaseUrl(apiBaseUrl);
  const resolvedTimeout = positiveInteger(timeoutMs, "timeoutMs", 60_000);

  async function get({
    path,
    query,
    purpose,
    correlationId,
    tenantId,
  }) {
    const normalizedCorrelationId = optionalRequestId(
      correlationId,
      "correlationId",
    );
    const normalizedTenantId = optionalRequestId(tenantId, "tenantId");

    return withOperatorSecret({
      secretProvider: resolvedProvider,
      access: {
        secretRef: resolvedCredentialRef,
        purpose,
        ...(normalizedCorrelationId
          ? { correlationId: normalizedCorrelationId }
          : {}),
        ...(normalizedTenantId ? { tenantId: normalizedTenantId } : {}),
      },
      consumer: async (lease) => {
        let rawResponse;

        try {
          rawResponse = await resolvedTransport.requestWithCredential({
            request: Object.freeze({
              method: "GET",
              url: buildUrl(resolvedBaseUrl, path, query),
              headers: Object.freeze({
                accept: "application/vnd.github+json",
                "x-github-api-version": API_VERSION,
                "user-agent": "api-developers-operator-gateway/0.1",
              }),
              timeoutMs: resolvedTimeout,
            }),
            credential: Object.freeze({
              scheme: "bearer",
              bytes: lease.bytes,
              ...(lease.version ? { version: lease.version } : {}),
            }),
          });
        } catch (error) {
          if (
            error instanceof GitHubReadonlyClientError ||
            error instanceof OperatorSecretContractError
          ) {
            throw error;
          }

          throw new GitHubReadonlyClientError(
            "github_transport_unavailable",
            "GitHub transport is unavailable",
            503,
          );
        }

        return normalizeResponse(rawResponse);
      },
    });
  }

  return Object.freeze({
    async getOrganization({
      organization,
      correlationId,
      tenantId,
    } = {}) {
      const resolvedOrganization = requiredIdentifier(
        organization,
        "organization",
      );
      const response = await get({
        path: `/orgs/${encodeURIComponent(resolvedOrganization)}`,
        purpose: "github.readonly.organization.get",
        correlationId,
        tenantId,
      });

      return sanitizeOrganization(response.body, resolvedOrganization);
    },

    async getRepository({
      owner,
      repository,
      correlationId,
      tenantId,
    } = {}) {
      const resolvedOwner = requiredIdentifier(owner, "owner");
      const resolvedRepository = requiredIdentifier(repository, "repository");
      const response = await get({
        path:
          `/repos/${encodeURIComponent(resolvedOwner)}` +
          `/${encodeURIComponent(resolvedRepository)}`,
        purpose: "github.readonly.repository.get",
        correlationId,
        tenantId,
      });

      return sanitizeRepository(
        response.body,
        resolvedOwner,
        resolvedRepository,
      );
    },

    async listOrganizationRepositories({
      organization,
      page = 1,
      perPage = 50,
      type = "all",
      correlationId,
      tenantId,
    } = {}) {
      const resolvedOrganization = requiredIdentifier(
        organization,
        "organization",
      );
      const resolvedPage = positiveInteger(page, "page", 99_999);
      const resolvedPerPage = positiveInteger(perPage, "perPage", 100);
      const resolvedType = String(type).trim();

      if (
        !["all", "public", "private", "forks", "sources", "member"].includes(
          resolvedType,
        )
      ) {
        throw new GitHubReadonlyClientError(
          "invalid_github_request",
          "type is invalid",
        );
      }

      const response = await get({
        path: `/orgs/${encodeURIComponent(resolvedOrganization)}/repos`,
        query: {
          type: resolvedType,
          page: resolvedPage,
          per_page: resolvedPerPage,
        },
        purpose: "github.readonly.repository.list",
        correlationId,
        tenantId,
      });

      if (
        !Array.isArray(response.body) ||
        response.body.length > resolvedPerPage
      ) {
        throw new GitHubReadonlyClientError(
          "github_contract_violation",
          "GitHub returned an invalid repository collection",
          502,
        );
      }

      const items = Object.freeze(
        response.body.map((item) =>
          sanitizeRepository(
            item,
            resolvedOrganization,
            requiredIdentifier(item?.name, "repository.name"),
          ),
        ),
      );

      const nextPage =
        nextPageFromHeaders(response.headers) ??
        (items.length === resolvedPerPage ? resolvedPage + 1 : undefined);

      return Object.freeze({
        items,
        ...(nextPage ? { nextPage } : {}),
      });
    },
  });
}
