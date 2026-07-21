import {
  normalizeRepositoryPath,
  resolveScope,
} from "./repository.mjs";

const SEVERITIES = Object.freeze(["INFO", "WARN", "ERROR", "CRITICAL"]);
const RULE_STATUSES = Object.freeze(["draft", "active", "deprecated", "retired", "suspended"]);
const RULESET_STATUSES = Object.freeze(["draft", "active", "deprecated", "retired", "suspended"]);

export class RuleEngineLoadError extends Error {
  constructor(code, message, details = {}, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "RuleEngineLoadError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function clone(value) {
  return structuredClone(value);
}

function isMissingFile(error) {
  return error?.code === "FILE_NOT_FOUND" || error?.errno === "ENOENT" || error?.code === "ENOENT";
}

async function readJsonDocument(filePath, readText, { required = true, kind = "document" } = {}) {
  const normalized = normalizeRepositoryPath(filePath);

  if (typeof readText !== "function") {
    throw new RuleEngineLoadError("READ_TEXT_REQUIRED", `Loading ${kind} requires readText().`);
  }

  let text;
  try {
    text = await readText(normalized);
  } catch (error) {
    if (!required && isMissingFile(error)) {
      return { status: "MISSING_OPTIONAL", path: normalized, document: null };
    }
    throw new RuleEngineLoadError(
      "READ_FAILED",
      `Unable to read ${kind}: ${normalized}`,
      { path: normalized, kind },
      error,
    );
  }

  try {
    return {
      status: "LOADED",
      path: normalized,
      document: JSON.parse(text),
    };
  } catch (error) {
    throw new RuleEngineLoadError(
      "INVALID_JSON",
      `Invalid JSON in ${kind}: ${normalized}`,
      { path: normalized, kind },
      error,
    );
  }
}

export function validateRulesetDocument(document, expected = {}) {
  const errors = [];

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return {
      valid: false,
      errors: [{ code: "RULESET_OBJECT_REQUIRED", path: "$" }],
    };
  }

  const required = [
    "rulesetId",
    "name",
    "version",
    "status",
    "scope",
    "sourceRefs",
    "effectiveFrom",
    "owner",
    "defaultSeverity",
    "rules",
  ];

  for (const key of required) {
    if (document[key] === undefined || document[key] === null || document[key] === "") {
      errors.push({ code: "REQUIRED", path: `$.${key}` });
    }
  }

  if (expected.expectedId && document.rulesetId !== expected.expectedId) {
    errors.push({
      code: "RULESET_ID_MISMATCH",
      path: "$.rulesetId",
      expected: expected.expectedId,
      observed: document.rulesetId ?? null,
    });
  }

  if (expected.expectedVersion && document.version !== expected.expectedVersion) {
    errors.push({
      code: "RULESET_VERSION_MISMATCH",
      path: "$.version",
      expected: expected.expectedVersion,
      observed: document.version ?? null,
    });
  }

  if (!/^\d+\.\d+\.\d+$/.test(document.version ?? "")) {
    errors.push({ code: "INVALID_SEMVER", path: "$.version" });
  }

  if (!RULESET_STATUSES.includes(document.status)) {
    errors.push({ code: "INVALID_RULESET_STATUS", path: "$.status" });
  }

  if (!SEVERITIES.includes(document.defaultSeverity)) {
    errors.push({ code: "INVALID_DEFAULT_SEVERITY", path: "$.defaultSeverity" });
  }

  if (!Array.isArray(document.sourceRefs) || document.sourceRefs.length === 0) {
    errors.push({ code: "SOURCE_REFS_REQUIRED", path: "$.sourceRefs" });
  }

  if (!Array.isArray(document.rules)) {
    errors.push({ code: "RULES_REQUIRED", path: "$.rules" });
  }

  const ids = new Set();

  for (const [index, rule] of (document.rules ?? []).entries()) {
    const prefix = `$.rules[${index}]`;
    const requiredRuleFields = [
      "ruleId",
      "ruleVersion",
      "title",
      "description",
      "category",
      "type",
      "severity",
      "status",
      "appliesTo",
      "parameters",
      "message",
      "remediation",
      "sourceRefs",
    ];

    for (const key of requiredRuleFields) {
      if (rule?.[key] === undefined || rule?.[key] === null || rule?.[key] === "") {
        errors.push({ code: "RULE_REQUIRED", path: `${prefix}.${key}` });
      }
    }

    if (ids.has(rule?.ruleId)) {
      errors.push({ code: "DUPLICATE_RULE_ID", path: `${prefix}.ruleId`, ruleId: rule.ruleId });
    }
    ids.add(rule?.ruleId);

    if (!/^\d+\.\d+\.\d+$/.test(rule?.ruleVersion ?? "")) {
      errors.push({ code: "INVALID_RULE_SEMVER", path: `${prefix}.ruleVersion` });
    }

    if (!SEVERITIES.includes(rule?.severity)) {
      errors.push({ code: "INVALID_RULE_SEVERITY", path: `${prefix}.severity` });
    }

    if (!RULE_STATUSES.includes(rule?.status)) {
      errors.push({ code: "INVALID_RULE_STATUS", path: `${prefix}.status` });
    }

    if (!Array.isArray(rule?.sourceRefs) || rule.sourceRefs.length === 0) {
      errors.push({ code: "RULE_SOURCE_REFS_REQUIRED", path: `${prefix}.sourceRefs` });
    }
  }

  return { valid: errors.length === 0, errors };
}

function normalizeRuleLifecycle(rule) {
  const evaluable = rule.status === "active" || rule.status === "deprecated";
  return {
    ...clone(rule),
    enabled: rule.enabled === false ? false : evaluable,
  };
}

export async function loadRuleset(
  descriptor,
  {
    readText,
  } = {},
) {
  const loaded = await readJsonDocument(descriptor?.path, readText, {
    required: true,
    kind: "ruleset",
  });

  const validation = validateRulesetDocument(loaded.document, descriptor);
  if (!validation.valid) {
    throw new RuleEngineLoadError(
      "INVALID_RULESET",
      `Ruleset validation failed: ${loaded.path}`,
      { path: loaded.path, errors: validation.errors },
    );
  }

  return Object.freeze({
    status: "VALIDATED",
    path: loaded.path,
    ruleset: Object.freeze({
      ...clone(loaded.document),
      rules: Object.freeze(
        loaded.document.rules
          .map(normalizeRuleLifecycle)
          .sort((a, b) =>
            a.ruleId.localeCompare(b.ruleId) ||
            a.ruleVersion.localeCompare(b.ruleVersion),
          ),
      ),
    }),
  });
}

export function validateExceptionSnapshot(document) {
  const errors = [];

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return {
      valid: false,
      errors: [{ code: "EXCEPTION_SNAPSHOT_OBJECT_REQUIRED", path: "$" }],
    };
  }

  if (!/^\d+\.\d+\.\d+$/.test(document.schemaVersion ?? "")) {
    errors.push({ code: "INVALID_SCHEMA_VERSION", path: "$.schemaVersion" });
  }

  if (!Array.isArray(document.exceptions)) {
    errors.push({ code: "EXCEPTIONS_REQUIRED", path: "$.exceptions" });
  }

  const ids = new Set();

  for (const [index, exception] of (document.exceptions ?? []).entries()) {
    const prefix = `$.exceptions[${index}]`;
    const required = [
      "exceptionId",
      "title",
      "status",
      "ruleIds",
      "scope",
      "justification",
      "owner",
      "approver",
      "createdAt",
      "effectiveFrom",
      "expiresAt",
      "mitigations",
      "remediationPlan",
      "evidenceRefs",
      "reviewCadence",
      "replacementRefs",
    ];

    for (const key of required) {
      if (
        exception?.[key] === undefined ||
        exception?.[key] === null ||
        exception?.[key] === ""
      ) {
        errors.push({ code: "EXCEPTION_REQUIRED", path: `${prefix}.${key}` });
      }
    }

    if (ids.has(exception?.exceptionId)) {
      errors.push({
        code: "DUPLICATE_EXCEPTION_ID",
        path: `${prefix}.exceptionId`,
        exceptionId: exception.exceptionId,
      });
    }
    ids.add(exception?.exceptionId);

    if (
      exception?.status === "active" &&
      Date.parse(exception.effectiveFrom) >= Date.parse(exception.expiresAt)
    ) {
      errors.push({ code: "INVALID_ACTIVE_WINDOW", path: prefix });
    }

    if (!Array.isArray(exception?.ruleIds) || exception.ruleIds.length === 0) {
      errors.push({ code: "EXCEPTION_RULE_IDS_REQUIRED", path: `${prefix}.ruleIds` });
    }

    if (!Array.isArray(exception?.evidenceRefs) || exception.evidenceRefs.length === 0) {
      errors.push({ code: "EXCEPTION_EVIDENCE_REQUIRED", path: `${prefix}.evidenceRefs` });
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function loadExceptionSnapshot(
  descriptor,
  {
    readText,
  } = {},
) {
  if (!descriptor?.path) {
    if (descriptor?.required) {
      throw new RuleEngineLoadError(
        "EXCEPTION_PATH_REQUIRED",
        "A required exception snapshot must declare path.",
      );
    }

    return Object.freeze({
      status: "NOT_CONFIGURED",
      path: null,
      exceptions: Object.freeze([]),
    });
  }

  const loaded = await readJsonDocument(descriptor.path, readText, {
    required: descriptor.required === true,
    kind: "exception snapshot",
  });

  if (loaded.status === "MISSING_OPTIONAL") {
    return Object.freeze({
      status: "MISSING_OPTIONAL",
      path: loaded.path,
      exceptions: Object.freeze([]),
    });
  }

  const validation = validateExceptionSnapshot(loaded.document);
  if (!validation.valid) {
    throw new RuleEngineLoadError(
      "INVALID_EXCEPTION_SNAPSHOT",
      `Exception snapshot validation failed: ${loaded.path}`,
      { path: loaded.path, errors: validation.errors },
    );
  }

  return Object.freeze({
    status: "VALIDATED",
    path: loaded.path,
    exceptions: Object.freeze(
      [...loaded.document.exceptions]
        .map(clone)
        .sort((a, b) => a.exceptionId.localeCompare(b.exceptionId)),
    ),
  });
}

export async function loadRuleEngineRuntime(
  input,
  {
    readText,
    listFiles,
    changedFiles = [],
  } = {},
) {
  const ruleset = await loadRuleset(input?.ruleset, { readText });
  const exceptionSnapshot = await loadExceptionSnapshot(input?.exceptions, { readText });
  const resolvedFiles = await resolveScope(input?.scope, { listFiles, changedFiles });

  return Object.freeze({
    ruleset: ruleset.ruleset,
    exceptions: exceptionSnapshot.exceptions,
    resolvedFiles,
    loadState: Object.freeze({
      ruleset: ruleset.status,
      exceptions: exceptionSnapshot.status,
      scope: "RESOLVED",
    }),
  });
}
