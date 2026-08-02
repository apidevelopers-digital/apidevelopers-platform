const DEFAULT_ALLOWED_HOSTS = Object.freeze([
  "apidevelopers.digital",
  "sitedauni.com",
  "api.sitedauni.com",
  "unico.sitedauni.com",
]);

const DEFAULT_ALLOWED_ROOTS = Object.freeze([
  "includes",
  "area-cliente/api",
  "database",
  "migrations",
]);

const DEFAULT_ALLOWED_EXTENSIONS = Object.freeze([
  "php",
  "sql",
  "json",
  "md",
]);

const BLOCKED_SEGMENTS = Object.freeze([
  ".env",
  ".git",
  ".ssh",
  "backup",
  "backups",
  "cache",
  "logs",
  "node_modules",
  "storage",
  "tmp",
  "uploads",
  "vendor",
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class HostingerStructureInventoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "HostingerStructureInventoryError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new HostingerStructureInventoryError(
      "invalid_request",
      `${name} is required`,
      { field: name },
    );
  }
  return normalized;
}

function normalizeAllowedValues(values, fallback, name) {
  const source = values === undefined ? fallback : values;
  if (!Array.isArray(source) || source.length === 0) {
    throw new TypeError(`${name} must be a non-empty array`);
  }

  const normalized = source.map((value) => requireText(value, name));
  return Object.freeze([...new Set(normalized)]);
}

function normalizeRelativePath(value, name = "path") {
  const path = requireText(value, name);

  if (
    path.includes("\0") ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.includes("://") ||
    /^[a-zA-Z]:/.test(path)
  ) {
    throw new HostingerStructureInventoryError(
      "path_not_allowed",
      `${name} must be a safe relative path`,
      { field: name },
    );
  }

  const segments = path.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        BLOCKED_SEGMENTS.includes(segment.toLowerCase()),
    )
  ) {
    throw new HostingerStructureInventoryError(
      "path_not_allowed",
      `${name} contains a blocked segment`,
      { field: name },
    );
  }

  return segments.join("/");
}

function isWithinRoot(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function normalizeExtension(value) {
  const extension = requireText(value, "extension")
    .toLowerCase()
    .replace(/^\./, "");

  if (!/^[a-z0-9]+$/.test(extension)) {
    throw new HostingerStructureInventoryError(
      "extension_not_allowed",
      "extension must be alphanumeric",
      { extension },
    );
  }

  return extension;
}

function normalizeRequest(
  input,
  {
    allowedHosts,
    allowedRoots,
    allowedExtensions,
  },
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HostingerStructureInventoryError(
      "invalid_request",
      "request must be an object",
    );
  }

  const institution = requireText(input.institution, "institution");
  const tenant = requireText(input.tenant, "tenant");
  const operator = requireText(input.operator, "operator");
  const correlationId = requireText(input.correlationId, "correlationId");
  const host = requireText(input.host, "host").toLowerCase();

  if (!allowedHosts.includes(host)) {
    throw new HostingerStructureInventoryError(
      "host_not_allowed",
      "host is not in the institutional allowlist",
      { host },
    );
  }

  const mode = input.mode ?? "metadata-only";
  if (mode !== "metadata-only") {
    throw new HostingerStructureInventoryError(
      "mode_not_allowed",
      "only metadata-only mode is permitted",
      { mode },
    );
  }

  if (input.includeContent === true) {
    throw new HostingerStructureInventoryError(
      "content_not_allowed",
      "file content cannot be requested by this operation",
    );
  }

  const requestedPaths = input.paths ?? [];
  if (
    !Array.isArray(requestedPaths) ||
    requestedPaths.length === 0 ||
    requestedPaths.length > 50
  ) {
    throw new HostingerStructureInventoryError(
      "invalid_request",
      "paths must contain between 1 and 50 entries",
      { field: "paths" },
    );
  }

  const paths = [...new Set(requestedPaths.map((path) => normalizeRelativePath(path)))];
  for (const path of paths) {
    if (!allowedRoots.some((root) => isWithinRoot(path, root))) {
      throw new HostingerStructureInventoryError(
        "root_not_allowed",
        "path is outside the institutional allowlist",
        { path },
      );
    }
  }

  const requestedExtensions = input.extensions ?? allowedExtensions;
  if (
    !Array.isArray(requestedExtensions) ||
    requestedExtensions.length === 0
  ) {
    throw new HostingerStructureInventoryError(
      "invalid_request",
      "extensions must be a non-empty array",
      { field: "extensions" },
    );
  }

  const extensions = [
    ...new Set(requestedExtensions.map((extension) => normalizeExtension(extension))),
  ];

  for (const extension of extensions) {
    if (!allowedExtensions.includes(extension)) {
      throw new HostingerStructureInventoryError(
        "extension_not_allowed",
        "extension is outside the institutional allowlist",
        { extension },
      );
    }
  }

  return Object.freeze({
    operationId: "operatorHostingerStructureInventory",
    institution,
    tenant,
    operator,
    correlationId,
    host,
    mode,
    includeContent: false,
    paths: Object.freeze(paths),
    extensions: Object.freeze(extensions),
  });
}

function sanitizeItem(
  item,
  {
    allowedRoots,
    allowedExtensions,
  },
) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new HostingerStructureInventoryError(
      "provider_contract_violation",
      "provider returned a non-object inventory item",
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(item, "content") ||
    Object.prototype.hasOwnProperty.call(item, "base64") ||
    Object.prototype.hasOwnProperty.call(item, "body")
  ) {
    throw new HostingerStructureInventoryError(
      "provider_returned_content",
      "provider returned file content to a metadata-only operation",
    );
  }

  const path = normalizeRelativePath(item.path, "item.path");
  if (!allowedRoots.some((root) => isWithinRoot(path, root))) {
    throw new HostingerStructureInventoryError(
      "provider_contract_violation",
      "provider returned a path outside the allowlist",
      { path },
    );
  }

  const extension = normalizeExtension(
    item.extension ?? path.split(".").at(-1),
  );
  if (!allowedExtensions.includes(extension)) {
    throw new HostingerStructureInventoryError(
      "provider_contract_violation",
      "provider returned a blocked extension",
      { path, extension },
    );
  }

  const sizeBytes = Number(item.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new HostingerStructureInventoryError(
      "provider_contract_violation",
      "provider returned an invalid file size",
      { path },
    );
  }

  const sha256 = requireText(item.sha256, "item.sha256").toLowerCase();
  if (!SHA256_PATTERN.test(sha256)) {
    throw new HostingerStructureInventoryError(
      "provider_contract_violation",
      "provider returned an invalid SHA-256 digest",
      { path },
    );
  }

  const modifiedAt = requireText(item.modifiedAt, "item.modifiedAt");
  if (Number.isNaN(Date.parse(modifiedAt))) {
    throw new HostingerStructureInventoryError(
      "provider_contract_violation",
      "provider returned an invalid modification timestamp",
      { path },
    );
  }

  return Object.freeze({
    path,
    extension,
    sizeBytes,
    modifiedAt,
    mime: requireText(item.mime, "item.mime"),
    sha256,
  });
}

export function createHostingerStructureInventoryService({
  inventoryAdapter,
  allowedHosts,
  allowedRoots,
  allowedExtensions,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof inventoryAdapter?.listMetadata !== "function") {
    throw new TypeError("inventoryAdapter.listMetadata must be a function");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  const policy = Object.freeze({
    allowedHosts: normalizeAllowedValues(
      allowedHosts,
      DEFAULT_ALLOWED_HOSTS,
      "allowedHosts",
    ).map((host) => host.toLowerCase()),
    allowedRoots: normalizeAllowedValues(
      allowedRoots,
      DEFAULT_ALLOWED_ROOTS,
      "allowedRoots",
    ).map((root) => normalizeRelativePath(root, "allowedRoots")),
    allowedExtensions: normalizeAllowedValues(
      allowedExtensions,
      DEFAULT_ALLOWED_EXTENSIONS,
      "allowedExtensions",
    ).map((extension) => normalizeExtension(extension)),
  });

  return Object.freeze({
    policy,

    async inventory(input) {
      const request = normalizeRequest(input, policy);
      const providerResult = await inventoryAdapter.listMetadata({
        host: request.host,
        paths: [...request.paths],
        extensions: [...request.extensions],
        includeContent: false,
        correlationId: request.correlationId,
      });

      if (
        !providerResult ||
        typeof providerResult !== "object" ||
        !Array.isArray(providerResult.items)
      ) {
        throw new HostingerStructureInventoryError(
          "provider_contract_violation",
          "provider result must contain an items array",
        );
      }

      const items = providerResult.items
        .map((item) => sanitizeItem(item, policy))
        .sort((left, right) => left.path.localeCompare(right.path));

      const blocked = Array.isArray(providerResult.blocked)
        ? providerResult.blocked.map((entry) =>
            Object.freeze({
              path: normalizeRelativePath(entry.path, "blocked.path"),
              reason: requireText(entry.reason, "blocked.reason"),
            }),
          )
        : [];

      return Object.freeze({
        operationId: request.operationId,
        institution: request.institution,
        tenant: request.tenant,
        operator: request.operator,
        correlationId: request.correlationId,
        host: request.host,
        mode: request.mode,
        generatedAt: requireText(now(), "generatedAt"),
        productionChanged: false,
        contentReturned: false,
        count: items.length,
        items: Object.freeze(items),
        blocked: Object.freeze(blocked),
      });
    },
  });
}
