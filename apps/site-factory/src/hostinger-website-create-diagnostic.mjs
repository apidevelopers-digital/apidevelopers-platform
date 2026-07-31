import crypto from "node:crypto";

export const DIAGNOSTIC_BRANCH =
  "evidence/hostinger-website-create-diagnostics";
export const DIAGNOSTIC_PATH =
  "apps/site-factory/evidence/hostinger-website-create-diagnostic-latest.json";

const ALLOWED_OUTCOMES = new Set([
  "success",
  "failure",
  "cancelled",
  "skipped",
  "unknown",
]);

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function normalizeOutcome(value) {
  const outcome =
    typeof value === "string" && value.trim() ? value.trim() : "unknown";
  if (!ALLOWED_OUTCOMES.has(outcome)) {
    throw new Error(`invalid_step_outcome:${outcome}`);
  }
  return outcome;
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function headers(token) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${required("GITHUB_TOKEN", token)}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
  };
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function request({
  fetchImpl,
  url,
  token,
  method,
  body,
  accepted,
}) {
  const response = await fetchImpl(url, {
    method,
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await readResponse(response);

  if (!accepted.includes(response.status)) {
    throw new Error(
      `github_api_failed:${method}:${response.status}:${response.statusText}`,
    );
  }
  return { status: response.status, payload };
}

export function buildWebsiteCreateDiagnostic({
  repository,
  sourceSha,
  workflowRunId,
  workflowRunAttempt,
  eventName,
  outcomes,
  generatedAt = new Date().toISOString(),
}) {
  repository = required("repository", repository);
  sourceSha = required("sourceSha", sourceSha);
  workflowRunId = required("workflowRunId", String(workflowRunId ?? ""));
  workflowRunAttempt = required(
    "workflowRunAttempt",
    String(workflowRunAttempt ?? ""),
  );
  eventName = required("eventName", eventName);

  if (!/^[a-f0-9]{40}$/.test(sourceSha)) {
    throw new Error("invalid_source_sha");
  }

  const steps = {
    validate: normalizeOutcome(outcomes?.validate),
    secret: normalizeOutcome(outcomes?.secret),
    claim: normalizeOutcome(outcomes?.claim),
    execute: normalizeOutcome(outcomes?.execute),
  };

  const ordered = ["validate", "secret", "claim", "execute"];
  const failedPhase =
    ordered.find((name) =>
      ["failure", "cancelled"].includes(steps[name]),
    ) ?? null;

  const body = {
    schemaVersion: "1.0",
    kind: "hostinger-business-hosting-website-create-diagnostic",
    mode: "api-root-diagnostic",
    executable: false,
    generatedAt,
    source: {
      repository,
      sha: sourceSha,
      workflowRunId,
      workflowRunAttempt,
      eventName,
    },
    steps,
    failedPhase,
    constraints: {
      hostingerPostExecutedByDiagnostic: false,
      hostingerWritesByDiagnostic: false,
      dnsChanged: false,
      buildStarted: false,
      deployExecuted: false,
      productionChanged: false,
      wordpressChanged: false,
    },
  };

  return Object.freeze({
    ...body,
    fingerprint: digest(body),
  });
}

export async function publishWebsiteCreateDiagnostic({
  token,
  repository,
  sourceSha,
  diagnostic,
  fetchImpl = fetch,
  apiBaseUrl = "https://api.github.com",
}) {
  repository = required("repository", repository);
  sourceSha = required("sourceSha", sourceSha);
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) {
    throw new Error("invalid_source_sha");
  }

  const base = `${apiBaseUrl}/repos/${repository}`;
  const refResult = await request({
    fetchImpl,
    url: `${base}/git/ref/heads/${DIAGNOSTIC_BRANCH}`,
    token,
    method: "GET",
    accepted: [200, 404],
  });

  if (refResult.status === 404) {
    await request({
      fetchImpl,
      url: `${base}/git/refs`,
      token,
      method: "POST",
      body: {
        ref: `refs/heads/${DIAGNOSTIC_BRANCH}`,
        sha: sourceSha,
      },
      accepted: [201],
    });
  }

  const currentUrl = new URL(`${base}/contents/${DIAGNOSTIC_PATH}`);
  currentUrl.searchParams.set("ref", DIAGNOSTIC_BRANCH);
  const current = await request({
    fetchImpl,
    url: currentUrl,
    token,
    method: "GET",
    accepted: [200, 404],
  });

  const body = {
    message: `diagnostic(site-factory): Hostinger executor run ${diagnostic.source.workflowRunId}`,
    content: Buffer.from(
      `${JSON.stringify(diagnostic, null, 2)}\n`,
      "utf8",
    ).toString("base64"),
    branch: DIAGNOSTIC_BRANCH,
  };

  if (current.status === 200) {
    body.sha = required("current.sha", current.payload?.sha);
  }

  const written = await request({
    fetchImpl,
    url: `${base}/contents/${DIAGNOSTIC_PATH}`,
    token,
    method: "PUT",
    body,
    accepted: [200, 201],
  });

  return Object.freeze({
    branch: DIAGNOSTIC_BRANCH,
    path: DIAGNOSTIC_PATH,
    commitSha: required(
      "written.commit.sha",
      written.payload?.commit?.sha,
    ),
    contentSha: required(
      "written.content.sha",
      written.payload?.content?.sha,
    ),
    diagnosticFingerprint: diagnostic.fingerprint,
  });
}
