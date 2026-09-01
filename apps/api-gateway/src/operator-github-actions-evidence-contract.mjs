const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SHA = /^[0-9a-f]{40}$/i;
const EVIDENCE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]{0,192}$/;
const FORBIDDEN = new Set([
  "authorization","base64","body","content","cookie","credential","credentials",
  "env","environmentvariables","metadata","password","passwordhash","payload",
  "query","raw","secret","secrets","set-cookie","sql","token","tokens","value","values",
]);

export class GitHubActionsEvidenceError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "GitHubActionsEvidenceError";
    this.code = code;
    this.status = status;
  }
}

export function requireGitHubIdentifier(value, field) {
  const text = String(value ?? "").trim();
  if (!IDENTIFIER.test(text)) {
    throw new GitHubActionsEvidenceError("invalid_github_actions_request", `${field} is invalid`, 400);
  }
  return text;
}

export function requireRunId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new GitHubActionsEvidenceError("invalid_github_actions_request", "runId is invalid", 400);
  }
  return id;
}

function text(value, field, optional = false) {
  if ((value === undefined || value === null || value === "") && optional) return "";
  const normalized = String(value ?? "").trim();
  if (!normalized || !SAFE_TEXT.test(normalized)) {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", `${field} is invalid`);
  }
  return normalized;
}

function conclusion(value) {
  if (value === undefined || value === null || value === "") return "";
  const normalized = String(value).trim().toLowerCase();
  if (!/^[a-z_]{2,32}$/.test(normalized)) {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", "conclusion is invalid");
  }
  return normalized;
}

function timestamp(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", `${field} is invalid`);
  }
  return new Date(normalized).toISOString();
}

function positive(value, field) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", `${field} is invalid`);
  }
  return id;
}

function checkRunId(value) {
  let url;
  try { url = new URL(String(value ?? "")); } catch {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", "check_run_url is invalid");
  }
  if (url.protocol !== "https:" || url.hostname !== "api.github.com" || url.search || url.hash) {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", "check_run_url is invalid");
  }
  const match = url.pathname.match(/\/check-runs\/([1-9][0-9]{0,19})$/);
  if (!match) throw new GitHubActionsEvidenceError("github_actions_contract_violation", "check_run_url is invalid");
  return Number(match[1]);
}

export function sanitizeWorkflowRun(body, { owner, repository, runId }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", "workflow run is invalid");
  }
  const id = positive(body.id, "run.id");
  if (id !== runId) throw new GitHubActionsEvidenceError("github_actions_contract_violation", "unexpected workflow run");
  const fullName = text(body.repository?.full_name, "run.repository.full_name");
  if (fullName.toLowerCase() !== `${owner}/${repository}`.toLowerCase()) {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", "workflow run repository mismatch");
  }
  const headSha = text(body.head_sha, "run.head_sha");
  if (!SHA.test(headSha)) throw new GitHubActionsEvidenceError("github_actions_contract_violation", "run.head_sha is invalid");
  return Object.freeze({
    id,
    name: text(body.name, "run.name"),
    status: text(body.status, "run.status").toLowerCase(),
    conclusion: conclusion(body.conclusion),
    event: text(body.event, "run.event"),
    headSha: headSha.toLowerCase(),
    branch: text(body.head_branch, "run.head_branch", true),
    runAttempt: positive(body.run_attempt ?? 1, "run.run_attempt"),
    updatedAt: timestamp(body.updated_at, "run.updated_at"),
  });
}

export function sanitizeWorkflowJobs(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.jobs) || body.jobs.length > 100) {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", "jobs collection is invalid");
  }
  return Object.freeze(body.jobs.map((job, index) => {
    if (!job || typeof job !== "object" || Array.isArray(job)) {
      throw new GitHubActionsEvidenceError("github_actions_contract_violation", `jobs[${index}] is invalid`);
    }
    const steps = Array.isArray(job.steps) ? job.steps.slice(0, 100).map((step, stepIndex) => Object.freeze({
      number: positive(step?.number, `jobs[${index}].steps[${stepIndex}].number`),
      name: text(step?.name, `jobs[${index}].steps[${stepIndex}].name`),
      status: text(step?.status, `jobs[${index}].steps[${stepIndex}].status`).toLowerCase(),
      conclusion: conclusion(step?.conclusion),
    })) : [];
    return Object.freeze({
      id: positive(job.id, `jobs[${index}].id`),
      name: text(job.name, `jobs[${index}].name`),
      status: text(job.status, `jobs[${index}].status`).toLowerCase(),
      conclusion: conclusion(job.conclusion),
      checkRunId: checkRunId(job.check_run_url),
      steps: Object.freeze(steps),
    });
  }));
}

function sanitizeEvidenceObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GitHubActionsEvidenceError("github_actions_evidence_invalid", "ADA_EVIDENCE must be a flat JSON object");
  }
  const keys = Object.keys(value).sort();
  if (keys.length < 1 || keys.length > 24) {
    throw new GitHubActionsEvidenceError("github_actions_evidence_invalid", "ADA_EVIDENCE field count is invalid");
  }
  const result = {};
  for (const key of keys) {
    if (!EVIDENCE_KEY.test(key) || FORBIDDEN.has(key.toLowerCase())) {
      throw new GitHubActionsEvidenceError("github_actions_evidence_invalid", "ADA_EVIDENCE contains a forbidden field");
    }
    const item = value[key];
    if (item === null || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) {
      result[key] = item;
    } else if (typeof item === "string" && item.trim().length <= 160 && SAFE_TEXT.test(item.trim())) {
      result[key] = item.trim();
    } else {
      throw new GitHubActionsEvidenceError("github_actions_evidence_invalid", "ADA_EVIDENCE values must be bounded primitives");
    }
  }
  const json = JSON.stringify(result);
  if (Buffer.byteLength(json) > 512) {
    throw new GitHubActionsEvidenceError("github_actions_evidence_invalid", "ADA_EVIDENCE exceeds the allowed size");
  }
  return json;
}

export function sanitizeAdaEvidenceAnnotations(body, job) {
  if (!Array.isArray(body) || body.length > 100) {
    throw new GitHubActionsEvidenceError("github_actions_contract_violation", "annotations collection is invalid");
  }
  const items = [];
  for (const annotation of body) {
    if (!annotation || typeof annotation !== "object" || Array.isArray(annotation)) continue;
    if (String(annotation.title ?? "").trim() !== "ADA_EVIDENCE") continue;
    const level = String(annotation.annotation_level ?? "").trim().toLowerCase();
    if (!["notice","warning","failure"].includes(level)) {
      throw new GitHubActionsEvidenceError("github_actions_evidence_invalid", "ADA_EVIDENCE annotation level is invalid");
    }
    let parsed;
    try { parsed = JSON.parse(String(annotation.message ?? "")); }
    catch { throw new GitHubActionsEvidenceError("github_actions_evidence_invalid", "ADA_EVIDENCE message must be JSON"); }
    items.push(Object.freeze({
      jobId: job.id,
      jobName: job.name,
      checkRunId: job.checkRunId,
      level,
      evidenceJson: sanitizeEvidenceObject(parsed),
    }));
    if (items.length > 20) throw new GitHubActionsEvidenceError("github_actions_evidence_invalid", "too many ADA_EVIDENCE annotations");
  }
  return Object.freeze(items);
}

export function buildGitHubActionsPaths({ owner, repository, runId, checkRunId: checkId }) {
  const safeOwner = requireGitHubIdentifier(owner, "owner");
  const safeRepo = requireGitHubIdentifier(repository, "repository");
  const safeRun = requireRunId(runId);
  const base = `/repos/${encodeURIComponent(safeOwner)}/${encodeURIComponent(safeRepo)}`;
  return Object.freeze({
    run: `${base}/actions/runs/${safeRun}`,
    jobs: `${base}/actions/runs/${safeRun}/jobs?per_page=100`,
    ...(checkId ? { annotations: `${base}/check-runs/${positive(checkId, "checkRunId")}/annotations?per_page=100` } : {}),
  });
}
