import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const SENSITIVE_FIELD =
  /api.?key|authorization|password|secret|token|credential|private.?key/i;

function clone(value) {
  return structuredClone(value);
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_FIELD.test(key) ? "[REDACTED]" : sanitize(item),
    ]),
  );
}

function normalizeLimit(limit) {
  const parsed = Number(limit ?? 100);
  if (!Number.isInteger(parsed) || parsed < 1) return 100;
  return Math.min(parsed, 500);
}

function createEntry(event, { clock, idFactory }) {
  if (!event || typeof event !== "object") {
    throw new TypeError("audit event must be an object");
  }

  if (typeof event.action !== "string" || event.action.trim() === "") {
    throw new TypeError("audit event action is required");
  }

  return Object.freeze({
    id: idFactory(),
    timestamp: clock(),
    actor: sanitize(event.actor ?? { type: "system", id: "unknown" }),
    action: event.action.trim(),
    resource: sanitize(event.resource ?? null),
    outcome: event.outcome ?? "success",
    requestId: event.requestId ?? null,
    metadata: sanitize(event.metadata ?? {}),
  });
}

export function createMemoryAuditLog({
  clock = () => new Date().toISOString(),
  idFactory = () => randomUUID(),
  initialEntries = [],
} = {}) {
  const entries = initialEntries.map((entry) => clone(entry));

  return Object.freeze({
    kind: "memory",

    append(event) {
      const entry = createEntry(event, { clock, idFactory });
      entries.push(entry);
      return clone(entry);
    },

    list({ limit } = {}) {
      return entries.slice(-normalizeLimit(limit)).reverse().map(clone);
    },
  });
}

export function createJsonlAuditLog({
  filePath,
  clock = () => new Date().toISOString(),
  idFactory = () => randomUUID(),
} = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new TypeError("filePath must be a non-empty string");
  }

  const absolutePath = resolve(filePath);

  return Object.freeze({
    kind: "jsonl-file",
    filePath: absolutePath,

    append(event) {
      const entry = createEntry(event, { clock, idFactory });
      mkdirSync(dirname(absolutePath), { recursive: true });
      appendFileSync(absolutePath, `${JSON.stringify(entry)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      return clone(entry);
    },

    list({ limit } = {}) {
      if (!existsSync(absolutePath)) return [];

      const lines = readFileSync(absolutePath, "utf8")
        .split("\n")
        .filter(Boolean)
        .slice(-normalizeLimit(limit))
        .reverse();

      return lines.map((line) => JSON.parse(line));
    },
  });
}
