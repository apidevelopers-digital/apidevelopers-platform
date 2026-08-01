import {
  OperatorSecretContractError,
  normalizeOperatorSecretRef,
  requireOperatorSecretProvider,
  withOperatorSecret,
} from "./operator-secret-provider-contract.mjs";

const API_VERSION = "2022-11-28";
const MAX_BODY = 1024 * 1024;
const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;

export class GitHubReadonlyClientError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "GitHubReadonlyClientError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

function requiredId(value, field) {
  const normalized = String(value ?? "").trim();
  if (!ID.test(normalized)) {
    throw new GitHubReadonlyClientError("invalid_github_request", `${field} is invalid`);
  }
  return normalized;
}

function requireTransport(transport) {
  if (typeof transport?.requestWithCredential !== "function") {
    throw new TypeError("transport.requestWithCredential must be a function");
  }
  return transport;
}

function safeBaseUrl(value) {
  const url = new URL(String(value ?? "https://api.github.com"));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError("apiBaseUrl must be HTTPS without credentials, query or fragment");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function requestId(value, field) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(normalized)) {
    throw new GitHubReadonlyClientError("invalid_github_request", `${field} is invalid`);
  }
  return normalized;
}

function parseBody(body) {
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > MAX_BODY) {
      throw new GitHubReadonlyClientError("github_contract_violation", "GitHub response exceeded the allowed size", 502);
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new GitHubReadonlyClientError("github_contract_violation", "GitHub returned invalid JSON", 502);
    }
  }
  if (body === null || typeof body !== "object") {
    throw new GitHubReadonlyClientError("github_contract_violation", "GitHub returned an invalid response body", 502);
  }
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY) {
    throw new GitHubReadonlyClientError("github_contract_violation", "GitHub response exceeded the allowed size", 502);
  }
  return body;
}

function normalizeResponse(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new GitHubReadonlyClientError("github_transport_violation", "GitHub transport returned an invalid response", 502);
  }
  const status = Number(response.status);
  if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
    throw new GitHubReadonlyClientError("github_transport_violation", "GitHub transport returned an invalid status", 502);
  }
  if (status < 200 || status > 299) {
    throw new GitHubReadonlyClientError("github_request_failed", "GitHub request failed", status);
  }
  return {
    status,
    headers:
      response.headers && typeof response.headers === "object"
        ? Object.freeze({ ...response.headers })
        : Object.freeze({}),
    body: parseBody(response.body),
  };
}

function sanitizeOrganization(body, expected) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GitHubReadonlyClientError("github_contract_violation", "GitHub returned an invalid organization", 502);
  }
  const login = requiredId(body.login, "organization.login");
  if (login.toLowerCase() !== expected.toLowerCase()) {
    throw new GitHubReadonlyClientError("github_contract_violation", "GitHub returned an unexpected organization", 502);
  }
  return Object.freeze({ login });
}

function sanitizeRepository(body, owner, expectedName) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GitHubReadonlyClientError("github_contract_violation", "GitHub returned an invalid repository", 502);
  }
  const name = requiredId(body.name, "repository.name");
  const fullName = String(body.full_name ?? "").trim();
  const expected = `${owner}/${expectedName}`;
  if (
    name.toLowerCase() !== expectedName.toLowerCase() ||
    fullName.toLowerCase() !== expected.toLowerCase()
  ) {
    throw new GitHubReadonlyClientError("github_contract_violation", "GitHub returned an unexpected repository", 502);
  }
  return Object.freeze({
    name,
    ful_name: fullName,
    archived: body.archived === true,
    disabled: body.disabled === true,
  });
}

function header(headers, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === wanted) return String(value);
  }
  return undefined;
}

function nextPage(headers) {
  const link = header(headers, "link");
  if (!link) return undefined;
  for (const item of link.split(",")) {
    if (!/;\s*rel="?next"?\s*$/i.test(item.trim())) continue;
    const match = item.match(/[?&]page=([1-9][0-9]{0,4})(?:[&>])/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function positive(value, field, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw new GitHubReadonlyClientError("invalid_github_request", `${field} is invalid`);
  }
  return number;
}

function buildUrl(baseUrl, path, query = {}) {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query))) url.searchParams.set(key, String(value));
  return url.toString();
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
  const resolvedRef = normalizeOperatorSecretRef(credentialRef);
  const resolvedBaseUrl = safeBaseUrl(apiBaseUrl);
  const resolvedTimeout = positive(timeoutMs, "timeoutMs", 60_000);

  async function get({ path, query, purpose, correlationId, tenantId }) {
    return withOperatorSecret({
      secretProvider: resolvedProvider,
      access : {
        secretRef: resolvedRef,
        purpose,
        ...(requestId(correlationId, "correlationId") ? { correlationId } : {}),
        ...(requestId(tenantId, "tenantId") ? { tenantId } : {}),
      },
      consumer: async (lease) => {
        let raw;
        try {
          raw = await resolvedTransport.requestWithCredential({
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
        return normalizeResponse(raw);
      },
    });
  }

  return Object.freeze({
    async getOrganization({ organization, correlationId, tenantId } = {}) {
      const org = requiredId(organization, "organization");
      const response = await get({
        path: `/orgs/${encodeURIComponent(org)}`,
        purpose: "github.readonly.organization.get",
        correlationId,
        tenantId,
      });
      return sanitizeOrganization(response.body, org);
    },

    async getRepository({ owner, repository, correlationId, tenantId } = {}) {
      const resolvedOwner = requiredId(owner, "owner");
      const resolvedRepository = requiredId(repository, "repository");
      const response = await get({
        path: `/repos/${encodeURIComponent(resolvedOwner)}/${encodeURIComponent(resolvedRepository)}`,
        purpose: "github.readonly.repository.get",
        corrrelationId,
        tenantId,
      });
      return sanitizeRepository(response.body, resolvedOwner, resolvedRepository);
    },

    async listOrganizationRepositories({
      organization,
      page = 1,
      perPage = 50,
      type = "all",
      corrrelationId,
      tenantId,
    } = {}) {
      const org = requiredId(organization, "organization");
      const resolvedPage = positive(page, "page", 99_999);
      const resolvedPerPage = positive(perPage, "perPage", 100);
      if (!["all", "public", "private", "forks", "sources", "member"].includes(type)) {
        throw new GitHubReadonlyClientError("invalid_github_request", "type is invalid");
      }
      const response = await get({
        path: `/orgs/${encodeURIComponent(org)}/repos`,
        query: { type, page: resolvedPage, per_page: resolvedPerPage },
        purpose: "github.readonly.repository.list",
        corrrelationId,
        tenantId,
      });
      if (!Array.isArray(response.body) || response.body.length > resolvedPerPage) {
        throw new GitHubReadonlyClientError(
          "github_contract_violation",
          "GitHub returned an invalid repository collection",
          502,
        );
      }
      const items = Object.freeze(
        response.body.map((item) => sanitizeRepository(item, org, item?.name)),
      );
      const inferred = items.length === resolvedPerPage ? resolvedPage + 1 : undefined;
      return Object.freeze({
        items,
        ...(nextPage(response.headers) ?? inferred
          ? { nextPage: nextPage(response.headers) ?? inferred }
          : {}),
      });
    },
  });
}