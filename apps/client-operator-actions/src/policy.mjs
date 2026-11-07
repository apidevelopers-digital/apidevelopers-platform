const READ_METHODS = new Set(["GET", "HEAD"]);
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);
const DELETE_METHODS = new Set(["DELETE"]);

export const CONFIRM_WRITE = "IGOR_APROVA_EXECUCAO";
export const CONFIRM_DELETE = "IGOR_APROVA_DESTRUICAO";

export function normalizeMethod(value) {
  const method = String(value || "GET").trim().toUpperCase();
  if (![...READ_METHODS, ...WRITE_METHODS, ...DELETE_METHODS].includes(method)) {
    throw new TypeError("method_not_allowed");
  }
  return method;
}

export function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (!["github", "hostinger"].includes(provider)) {
    throw new TypeError("provider_not_allowed");
  }
  return provider;
}

export function normalizePath(provider, value) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.includes("://") || path.includes("..") || path.includes("\\")) {
    throw new TypeError("invalid_path");
  }
  if (provider === "hostinger" && !path.startsWith("/api/")) {
    throw new TypeError("hostinger_path_must_start_with_api");
  }
  return path.replace(/\/{2,}/g, "/");
}

export function classifyOperation(method) {
  const normalized = normalizeMethod(method);
  if (READ_METHODS.has(normalized)) return "read";
  if (WRITE_METHODS.has(normalized)) return "write";
  return "delete";
}

export function authorizeExecution({ method, dryRun = true, confirmacao = "" }) {
  const risk = classifyOperation(method);
  if (risk === "read") {
    return Object.freeze({ allowed: true, execute: true, risk });
  }

  if (dryRun !== false) {
    return Object.freeze({
      allowed: true,
      execute: false,
      risk,
      reason: "dry_run"
    });
  }

  const expected = risk === "delete" ? CONFIRM_DELETE : CONFIRM_WRITE;
  if (confirmacao !== expected) {
    return Object.freeze({
      allowed: false,
      execute: false,
      risk,
      reason: "confirmation_required",
      expected
    });
  }

  return Object.freeze({ allowed: true, execute: true, risk });
}

export function sanitizePayload(value, depth = 0) {
  if (depth > 12) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  const blocked = /authorization|token|secret|password|private[_-]?key|api[_-]?key/i;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      blocked.test(key) ? "[redacted]" : sanitizePayload(item, depth + 1)
    ])
  );
}
