import {
  OperatorReadonlyError,
  createUnavailableOperatorReadonlyAdapters,
} from "./operator-readonly-contract.mjs";

const ORGANIZATION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const CURSOR_PATTERN = /^github_repo_page_([1-9][0-9]{0,4})$/;
const MAX_GITHUB_PAGE_SIZE = 100;
const MAX_OPERATOR_ITEMS = 200;
const REPOSITORY_CAPABILITIES = Object.freeze([
  "github:repository:metadata:read",
]);

function invalidRequest(message, details = {}) {
  return new OperatorReadonlyError("invalid_request", message, details);
}

function requireClient(client) {
  if (!client || typeof client !== "object" || Array.isArray(client)) {
    throw new TypeError("client must be an object");
  }
  return client;
}

function requireOrganization(value) {
  const organization = String(value ?? "").trim();
  if (!ORGANIZATION_PATTERN.test(organization)) {
    throw new TypeError("organization must be a valid GitHub organization identifier");
  }
  return organization;
}

function requireMethod(client, name) {
  if (typeof client[name] !== "function") {
    throw new OperatorReadonlyError(
      "adapter_unavailable",
      `GitHub read-only client method ${name} is unavailable`,
      { provider: "github", method: name },
    );
  }
  return client[name].bind(client);
}

function checkedAt(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("now must return a valid date");
  }
  return date.toISOString();
}

function requireGitHubTarget(request, supportedResourceTypes) {
  const target = request?.target;
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw invalidRequest("target is required", { field: "target" });
  }
  if (target.provider !== "github") {
    throw new OperatorReadonlyError(
      "adapter_unavailable",
      "no GitHub adapter is available for the requested provider",
      { provider: String(target.provider ?? "") },
    );
  }
  if (!supportedResourceTypes.has(target.resourceType)) {
    throw invalidRequest("unsupported GitHub resource type", {
      field: "target.resourceType",
      resourceType: String(target.resourceType ?? ""),
    });
  }
  return target;
}

function requireConfiguredOrganization(target, organization) {
  if (
    target.resourceId !== undefined &&
    String(target.resourceId).toLowerCase() !== organization.toLowerCase()
  ) {
    throw invalidRequest("target organization differs from the configured authority", {
      field: "target.resourceId",
    });
  }
  return organization;
}

function parseRepositoryId(value, organization) {
  const resourceId = String(value ?? "").trim();
  const parts = resourceId.split("/");
  if (
    parts.length !== 2 ||
    !ORGANIZATION_PATTERN.test(parts[0]) ||
    !REPOSITORY_PATTERN.test(parts[1]) ||
    parts[0].toLowerCase() !== organization.toLowerCase()
  ) {
    throw invalidRequest("repository resourceId must be organization/repository", {
      field: "target.resourceId",
    });
  }
  return Object.freeze({ owner: parts[0], repository: parts[1] });
}

function parseCursor(value) {
  if (value === undefined) return 1;
  const match = CURSOR_PATTERN.exec(String(value));
  if (!match) {
    throw invalidRequest("cursor is not a valid GitHub repository cursor", {
      field: "cursor",
    });
  }
  return Number(match[1]);
}

function normalizeNextPage(value) {
  if (value === undefined || value === null || value === false) return undefined;
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || page > 99999) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      "GitHub client returned an invalid next page",
    );
  }
  return page;
}

function clientStatus(error) {
  const value =
    error?.status ??
    error?.statusCode ??
    error?.response?.status ??
    error?.response?.statusCode;
  const status = Number(value);
  return Number.isSafeInteger(status) ? status : undefined;
}

function statusFromError(error) {
  const status = clientStatus(error);
  if (status === 401 || status === 403) {
    return Object.freeze({ state: "blocked", message: "github access denied" });
  }
  if (status === 404) {
    return Object.freeze({ state: "offline", message: "github resource not found" });
  }
  if (status === 429) {
    return Object.freeze({ state: "attention", message: "github rate limited" });
  }
  return Object.freeze({ state: "offline", message: "github unavailable" });
}

function inventoryError(error) {
  const status = clientStatus(error);
  const reason =
    status === 401 || status === 403
      ? "access_denied"
      : status === 404
        ? "not_found"
        : status === 429
          ? "rate_limited"
          : "unavailable";
  return new OperatorReadonlyError(
    "adapter_unavailable",
    "GitHub repository inventory is unavailable",
    { provider: "github", reason },
  );
}


function organizationIdentity(organization, configuredOrganization) {
  if (!organization || typeof organization !== "object" || Array.isArray(organization)) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      "GitHub client returned an invalid organization descriptor",
    );
  }
  const login = String(organization.login ?? "").trim();
  if (login.toLowerCase() !== configuredOrganization.toLowerCase()) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      "GitHub client returned an organization outside the configured authority",
    );
  }
  return login;
}

function repositoryState(repository) {
  if (repository.disabled === true) return "blocked";
  if (repository.archived === true) return "attention";
  return "online";
}

function repositoryIdentity(repository, organization, index) {
  if (!repository || typeof repository !== "object" || Array.isArray(repository)) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      "GitHub client returned an invalid repository descriptor",
      { index },
    );
  }

  const name = String(repository.name ?? "").trim();
  if (!REPOSITORY_PATTERN.test(name)) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      "GitHub client returned an invalid repository name",
      { index },
    );
  }

  const expected = `${organization}/${name}`;
  const fullName = String(repository.full_name ?? expected).trim();
  if (fullName.toLowerCase() !== expected.toLowerCase()) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      "GitHub client returned a repository outside the configured organization",
      { index },
    );
  }

  return Object.freeze({ name, fullName });
}

function repositoryInventoryItem(repository, organization, index) {
  const identity = repositoryIdentity(repository, organization, index);
  return Object.freeze({
    resourceId: identity.fullName,
    kind: "repository",
    name: identity.name,
    status: repositoryState(repository),
    parentId: `github:organization:${organization}`,
    capabilities: REPOSITORY_CAPABILITIES,
  });
}

function normalizeRepositoryCollection(result) {
  const items = Array.isArray(result) ? result : result?.items;
  if (!Array.isArray(items)) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      "GitHub client must return an array or an items array",
    );
  }
  return Object.freeze({
    items,
    nextPage: Array.isArray(result) ? undefined : normalizeNextPage(result.nextPage),
  });
}

export function createGitHubReadonlyAdapters({
  client,
  organization,
  now = () => new Date(),
} = {}) {
  const resolvedClient = requireClient(client);
  const resolvedOrganization = requireOrganization(organization);
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const unavailable = createUnavailableOperatorReadonlyAdapters();

  async function status(request = {}) {
    const target = requireGitHubTarget(
      request,
      new Set(["organization", "repository"]),
    );
    const timestamp = checkedAt(now);

    if (target.resourceType === "organization") {
      const authority = requireConfiguredOrganization(target, resolvedOrganization);
      try {
        const getOrganization = requireMethod(resolvedClient, "getOrganization");
        const organization = await getOrganization({ organization: authority });
        organizationIdentity(organization, authority);
        return Object.freeze({
          items: Object.freeze([
            Object.freeze({
              resourceId: `github:organization:${authority}`,
              kind: "organization",
              state: "online",
              checkedAt: timestamp,
              message: "github organization reachable",
            }),
          ]),
        });
      } catch (error) {
        if (error instanceof OperatorReadonlyError) throw error;
        const mapped = statusFromError(error);
        return Object.freeze({
          items: Object.freeze([
            Object.freeze({
              resourceId: `github:organization:${authority}`,
              kind: "organization",
              state: mapped.state,
              checkedAt: timestamp,
              message: mapped.message,
            }),
          ]),
        });
      }
    }

    const repositoryId = parseRepositoryId(target.resourceId, resolvedOrganization);
    try {
      const getRepository = requireMethod(resolvedClient, "getRepository");
      const repository = await getRepository({
        owner: repositoryId.owner,
        repository: repositoryId.repository,
      });
      const identity = repositoryIdentity(repository, resolvedOrganization, 0);
      return Object.freeze({
        items: Object.freeze([
          Object.freeze({
            resourceId: identity.fullName,
            kind: "repository",
            state: repositoryState(repository),
            checkedAt: timestamp,
            message:
              repository.disabled === true
                ? "github repository disabled"
                : repository.archived === true
                  ? "github repository archived"
                  : "github repository reachable",
          }),
        ]),
      });
    } catch (error) {
      if (error instanceof OperatorReadonlyError) throw error;
      const mapped = statusFromError(error);
      return Object.freeze({
        items: Object.freeze([
          Object.freeze({
            resourceId: `${repositoryId.owner}/${repositoryId.repository}`,
            kind: "repository",
            state: mapped.state,
            checkedAt: timestamp,
            message: mapped.message,
          }),
        ]),
      });
    }
  }

  async function inventory(request = {}) {
    const target = requireGitHubTarget(request, new Set(["repository"]));
    if (target.resourceId !== undefined) {
      throw invalidRequest("repository inventory does not accept resourceId", {
        field: "target.resourceId",
      });
    }

    const page = parseCursor(request.cursor);
    const requestedLimit = Number(request.limit ?? 50);
    if (
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > MAX_OPERATOR_ITEMS
    ) {
      throw invalidRequest("limit must be a positive integer", { field: "limit" });
    }
    const perPage = Math.min(requestedLimit, MAX_GITHUB_PAGE_SIZE);

    try {
      const listRepositories = requireMethod(
        resolvedClient,
        "listOrganizationRepositories",
      );
      const raw = await listRepositories({
        organization: resolvedOrganization,
        page,
        perPage,
        type: "all",
      });
      const collection = normalizeRepositoryCollection(raw);
      const items = Object.freeze(
        collection.items
          .slice(0, perPage)
          .map((repository, index) =>
            repositoryInventoryItem(repository, resolvedOrganization, index),
          ),
      );
      const inferredNextPage =
        collection.nextPage ??
        (collection.items.length >= perPage ? page + 1 : undefined);

      return Object.freeze({
        items,
        ...(inferredNextPage
          ? { cursor: `github_repo_page_${inferredNextPage}` }
          : {}),
      });
    } catch (error) {
      if (
        error instanceof OperatorReadonlyError &&
        error.code !== "provider_contract_violation"
      ) {
        throw error;
      }
      if (error instanceof OperatorReadonlyError) throw error;
      throw inventoryError(error);
    }
  }

  return Object.freeze({
    status,
    inventory,
    read: unavailable.read,
    audit: unavailable.audit,
  });
}
