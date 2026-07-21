import { createHash } from "node:crypto";
import path from "node:path";

export const ENGINE_NAME = "@apidevelopers/architecture-rule-engine";
export const ENGINE_VERSION = "0.1.0";
export const RESULT_STATES = Object.freeze(["COMPLIANT","CONDITIONAL","NON_COMPLIANT","INVALID","INCOMPLETE"]);
export const SEVERITIES = Object.freeze(["INFO","WARN","ERROR","CRITICAL"]);
const RANK = Object.freeze({ INFO: 0, WARN: 1, ERROR: 2, CRITICAL: 3 });
const EXIT = Object.freeze({ COMPLIANT: 0, CONDITIONAL: 0, NON_COMPLIANT: 1, INVALID: 2, INCOMPLETE: 3 });
const forbidden = /(token|secret|password|api[_-]?key|authorization|bearer|private[_-]?key|database[_-]?url)/i;

const clone = (value) => structuredClone(value);
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
export const stableStringify = (value) => JSON.stringify(canonical(value));
export const hashCanonical = (value) => `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;

function walk(value, location = "$", errors = []) {
  if (!value || typeof value !== "object") return errors;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key)) errors.push({ code: "SECRET_LIKE_FIELD", path: `${location}.${key}` });
    walk(child, `${location}.${key}`, errors);
  }
  return errors;
}
function safeRelative(value) {
  if (typeof value !== "string" || !value) return false;
  const normalized = path.posix.normalize(value.replaceAll("\\", "/")).replace(/^\.\//, "");
  return normalized !== ".." && !normalized.startsWith("../") && !path.posix.isAbsolute(normalized);
}
export function validateEngineInput(input) {
  const errors = walk(input);
  const required = ["schemaVersion","repository","ruleset","scope","execution","outputs"];
  if (!input || typeof input !== "object") errors.push({ code: "INVALID_INPUT", path: "$" });
  for (const key of required) if (!input?.[key]) errors.push({ code: "REQUIRED", path: `$.${key}` });
  if (!/^1\.\d+\.\d+$/.test(input?.schemaVersion ?? "")) errors.push({ code: "SCHEMA_VERSION", path: "$.schemaVersion" });
  if (!/^[0-9a-f]{40}$/.test(input?.repository?.commitSha ?? "")) errors.push({ code: "COMMIT_SHA", path: "$.repository.commitSha" });
  if (!safeRelative(input?.repository?.workspacePath)) errors.push({ code: "UNSAFE_PATH", path: "$.repository.workspacePath" });
  if (!safeRelative(input?.ruleset?.path)) errors.push({ code: "UNSAFE_PATH", path: "$.ruleset.path" });
  if (!safeRelative(input?.outputs?.directory)) errors.push({ code: "UNSAFE_PATH", path: "$.outputs.directory" });
  if (!SEVERITIES.includes(input?.execution?.failThreshold)) errors.push({ code: "FAIL_THRESHOLD", path: "$.execution.failThreshold" });
  return { valid: errors.length === 0, errors, value: errors.length ? null : clone(input) };
}
export function validateRuleset(ruleset, expected = {}) {
  const errors = [];
  if (!ruleset || typeof ruleset !== "object") errors.push({ code: "RULESET_REQUIRED" });
  if (ruleset?.rulesetId !== expected.expectedId) errors.push({ code: "RULESET_ID_MISMATCH" });
  if (ruleset?.version !== expected.expectedVersion) errors.push({ code: "RULESET_VERSION_MISMATCH" });
  if (!Array.isArray(ruleset?.rules)) errors.push({ code: "RULES_REQUIRED" });
  const ids = new Set();
  for (const [index, rule] of (ruleset?.rules ?? []).entries()) {
    if (!rule?.ruleId) errors.push({ code: "RULE_ID_REQUIRED", index });
    if (ids.has(rule?.ruleId)) errors.push({ code: "DUPLICATE_RULE_ID", ruleId: rule.ruleId });
    ids.add(rule?.ruleId);
    if (!rule?.ruleVersion || !rule?.type || !SEVERITIES.includes(rule?.severity)) {
      errors.push({ code: "INVALID_RULE", ruleId: rule?.ruleId ?? null });
    }
  }
  return { valid: errors.length === 0, errors };
}
function compareFindings(a, b) {
  return RANK[b.severity] - RANK[a.severity] ||
    a.ruleId.localeCompare(b.ruleId) || a.path.localeCompare(b.path) ||
    a.fingerprint.localeCompare(b.fingerprint);
}
function normalizeFinding(raw, rule, rulesetVersion) {
  if (!rule) throw new TypeError(`unknown rule: ${raw?.ruleId}`);
  const finding = {
    findingId: "",
    fingerprint: "",
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
    severity: raw.severity ?? rule.severity,
    status: raw.status ?? "OPEN",
    message: String(raw.message ?? rule.description ?? rule.ruleId),
    path: String(raw.path ?? ""),
    location: { line: raw.location?.line ?? null, column: raw.location?.column ?? null },
    observed: clone(raw.observed ?? null),
    expected: clone(raw.expected ?? null),
    remediation: String(raw.remediation ?? rule.remediation ?? ""),
    sourceRefs: [...(raw.sourceRefs ?? rule.sourceRefs ?? [])].sort(),
    exception: null,
    metadata: canonical(raw.metadata ?? {}),
  };
  finding.fingerprint = hashCanonical({
    rulesetVersion, ruleId: finding.ruleId, ruleVersion: finding.ruleVersion,
    path: finding.path, location: finding.location, observed: finding.observed, expected: finding.expected,
  });
  finding.findingId = `${finding.ruleId}:${finding.fingerprint.slice(-12)}`;
  return finding;
}
export function applyExceptions(findings, exceptions = [], context = {}) {
  const at = Date.parse(context.evaluatedAt);
  const ordered = [...exceptions].sort((a,b) => String(a.exceptionId).localeCompare(String(b.exceptionId)));
  return findings.map((finding) => {
    const match = ordered.find((item) =>
      String(item?.status).toUpperCase() === "ACTIVE" && item.exceptionId && item.owner && item.approver &&
      item.expiresAt && at < Date.parse(item.expiresAt) &&
      (!item.effectiveFrom || at >= Date.parse(item.effectiveFrom)) &&
      (!item.repository || item.repository === context.repository.fullName) &&
      (!item.branch || item.branch === context.repository.branch) &&
      (!Array.isArray(item.ruleIds) || item.ruleIds.includes(finding.ruleId)) &&
      (!Array.isArray(item.fingerprints) || item.fingerprints.includes(finding.fingerprint)) &&
      (!Array.isArray(item.paths) || item.paths.map((p) => p.replaceAll("\\","/")).includes(finding.path))
    );
    return match ? { ...clone(finding), status: "EXCEPTED", exception: {
      exceptionId: match.exceptionId, status: "ACTIVE", owner: match.owner, approver: match.approver,
      effectiveFrom: match.effectiveFrom ?? null, expiresAt: match.expiresAt,
      scopeMatched: true, ruleMatched: true,
    }} : clone(finding);
  }).sort(compareFindings);
}
export function calculateResult({ findings = [], failThreshold = "ERROR", invalid = false, incomplete = false } = {}) {
  if (!SEVERITIES.includes(failThreshold)) throw new Error(`unsupported fail threshold: ${failThreshold}`);
  if (invalid || findings.some((item) => item.status === "INVALID")) return "INVALID";
  if (incomplete) return "INCOMPLETE";
  const blocking = findings.filter((item) => RANK[item.severity] >= RANK[failThreshold]);
  if (blocking.some((item) => item.status === "OPEN")) return "NON_COMPLIANT";
  if (blocking.some((item) => item.status === "EXCEPTED")) return "CONDITIONAL";
  return "COMPLIANT";
}
export const mapExitCode = (result, { conditionalExitCode = 0 } = {}) =>
  result === "CONDITIONAL" ? conditionalExitCode : EXIT[result];

function counts(findings, field, keys = []) {
  const output = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const finding of findings) output[finding[field]] = (output[finding[field]] ?? 0) + 1;
  return canonical(output);
}
export function verifyValidationReport(report) {
  if (!report?.integrity) return false;
  const { integrity, ...unsigned } = report;
  const base = { algorithm: integrity.algorithm, input: integrity.input, ruleset: integrity.ruleset,
    exceptions: integrity.exceptions, findings: integrity.findings };
  return integrity.algorithm === "sha256" && hashCanonical({ ...unsigned, integrity: base }) === integrity.report;
}
export async function runRuleEngine(input, { ruleset, exceptions = [], resolvedFiles = [], adapters = {}, clock = () => new Date().toISOString() } = {}) {
  const startedAt = clock();
  const inputCheck = validateEngineInput(input);
  const safe = inputCheck.value ?? input ?? {};
  const rulesetCheck = validateRuleset(ruleset, safe.ruleset ?? {});
  const enabled = rulesetCheck.valid ? ruleset.rules.filter((rule) => rule.enabled !== false).sort((a,b) => a.ruleId.localeCompare(b.ruleId)) : [];
  const unsupported = enabled.filter((rule) => typeof adapters[rule.type] !== "function");
  const raw = [];
  let incomplete = false;
  if (inputCheck.valid && rulesetCheck.valid && unsupported.length === 0) {
    for (const rule of enabled) {
      try {
        const output = await adapters[rule.type]({ input: clone(safe), rule: clone(rule), targets: [...resolvedFiles].sort() });
        if (!Array.isArray(output)) throw new TypeError("adapter output must be an array");
        raw.push(...output.map((item) => ({ ...clone(item), ruleId: rule.ruleId })));
      } catch (error) {
        incomplete = true;
        raw.push({ ruleId: rule.ruleId, severity: rule.severity, message: `rule adapter failed: ${error.message}`,
          observed: { adapterFailure: true }, expected: { completed: true }, metadata: { internalFailure: true } });
      }
    }
  }
  const byId = new Map(enabled.map((rule) => [rule.ruleId, rule]));
  let findings = [];
  let malformed = false;
  try { findings = raw.map((item) => normalizeFinding(item, byId.get(item.ruleId), ruleset?.version ?? "0.0.0")).sort(compareFindings); }
  catch { malformed = true; }
  const repository = { fullName: `${safe.repository?.owner ?? "unknown"}/${safe.repository?.name ?? "unknown"}`, branch: safe.repository?.branch ?? "unknown" };
  findings = applyExceptions(findings, exceptions, { evaluatedAt: startedAt, repository });
  const invalid = !inputCheck.valid || !rulesetCheck.valid || unsupported.length > 0 || malformed;
  const result = calculateResult({ findings, failThreshold: safe.execution?.failThreshold ?? "ERROR", invalid, incomplete });
  const finishedAt = clock();
  const inputHash = hashCanonical(input ?? {});
  const rulesetHash = hashCanonical(ruleset ?? {});
  const exceptionHash = hashCanonical([...exceptions].sort((a,b) => String(a.exceptionId).localeCompare(String(b.exceptionId))));
  const findingsHash = hashCanonical(findings);
  const baseIntegrity = { algorithm: "sha256", input: inputHash, ruleset: rulesetHash, exceptions: exceptionHash, findings: findingsHash };
  const report = {
    schemaVersion: "1.0.0",
    reportId: `arch-report-${String(safe.repository?.commitSha ?? "unknown").slice(0,12)}-${hashCanonical({inputHash,rulesetHash}).slice(-12)}`,
    generatedAt: finishedAt,
    repository: { provider: safe.repository?.provider ?? "github", owner: safe.repository?.owner ?? "unknown",
      name: safe.repository?.name ?? "unknown", fullName: repository.fullName },
    revision: { branch: repository.branch, commitSha: safe.repository?.commitSha ?? "unknown",
      baseSha: safe.scope?.baseSha ?? null, headSha: safe.scope?.headSha ?? safe.repository?.commitSha ?? null, dirty: false },
    execution: { validatorName: ENGINE_NAME, validatorVersion: ENGINE_VERSION, mode: safe.execution?.mode ?? "local",
      startedAt, finishedAt, durationMs: 0, exitCode: mapExitCode(result), status: result === "INCOMPLETE" ? "INCOMPLETE" : result === "INVALID" ? "FAILED" : "COMPLETED" },
    ruleset: { rulesetId: ruleset?.rulesetId ?? safe.ruleset?.expectedId ?? "unknown", rulesetVersion: ruleset?.version ?? safe.ruleset?.expectedVersion ?? "unknown",
      schemaVersion: ruleset?.schemaVersion ?? null, source: safe.ruleset?.path ?? "", sourceCommit: safe.repository?.commitSha ?? "unknown",
      ruleCount: ruleset?.rules?.length ?? 0, enabledRuleCount: enabled.length, hash: rulesetHash },
    scope: { mode: safe.scope?.mode ?? "repository", include: [...(safe.scope?.include ?? [])].sort(),
      exclude: [...(safe.scope?.exclude ?? [])].sort(), resolvedFiles: [...new Set(resolvedFiles.map((p) => path.posix.normalize(p.replaceAll("\\","/")).replace(/^\.\//, "")))].sort(),
      resolvedFileCount: new Set(resolvedFiles).size, changedFiles: safe.scope?.mode === "changed-files" ? [...new Set(resolvedFiles.map((p) => path.posix.normalize(p.replaceAll("\\","/")).replace(/^\.\//, "")))].sort() : [] },
    summary: { result, findingCount: findings.length, openFindingCount: findings.filter((f) => f.status === "OPEN").length,
      exceptedFindingCount: findings.filter((f) => f.status === "EXCEPTED").length,
      suppressedFindingCount: findings.filter((f) => f.status === "SUPPRESSED").length,
      countsBySeverity: counts(findings, "severity", SEVERITIES), countsByStatus: counts(findings, "status", ["OPEN","EXCEPTED","RESOLVED","SUPPRESSED","INVALID"]),
      countsByRule: counts(findings, "ruleId"), blockingThreshold: safe.execution?.failThreshold ?? "ERROR",
      blockingFindingCount: findings.filter((f) => RANK[f.severity] >= RANK[safe.execution?.failThreshold ?? "ERROR"] && ["OPEN","EXCEPTED","INVALID"].includes(f.status)).length },
    findings, exceptions: [...exceptions].sort((a,b) => String(a.exceptionId).localeCompare(String(b.exceptionId))),
    artifacts: [], pipeline: [{ name: "VALIDATE_INPUT", status: inputCheck.valid ? "COMPLETED" : "FAILED", errors: inputCheck.errors },
      { name: "VALIDATE_RULESET", status: rulesetCheck.valid ? "COMPLETED" : "FAILED", errors: rulesetCheck.errors },
      { name: "EXECUTE_RULES", status: incomplete ? "FAILED" : invalid ? "SKIPPED" : "COMPLETED", errors: unsupported.map((rule) => ({ code: "UNSUPPORTED_REQUIRED_RULE", ruleId: rule.ruleId })) },
      { name: "CALCULATE_RESULT", status: "COMPLETED", metadata: { result } }],
    integrity: baseIntegrity,
  };
  report.integrity.report = hashCanonical(report);
  return Object.freeze(clone(report));
}
