import crypto from "node:crypto";

export const EXECUTION_BRANCH =
  "evidence/hostinger-website-create-execution";
export const EXECUTION_LOCK_PATH =
  "apps/site-factory/evidence/hostinger-website-create-lock.json";

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
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

function decodeJsonContent(payload) {
  const content = required("content", payload?.content).replace(/\s+/g, "");
  return JSON.parse(Buffer.from(content, "base64").toString("utf8"));
}

export function buildExecutionLock({
  authorization,
  repository,
  sourceSha,
  workflowRunId,
  claimedAt = new Date().toISOString(),
}) {
  const { draftInfo, approvalInfo } = authorization ?? {};
  const body = {
    schemaVersion: "1.0",
    kind: "hostinger-business-hosting-website-create-execution-lock",
    status: "claimed",
    singleUse: true,
    executable: false,
    claimedAt,
    source: {
      repository: required("repository", repository),
      sourceSha: required("sourceSha", sourceSha),
      workflowRunId: required(
        "workflowRunId",
        String(workflowRunId ?? ""),
      ),
      draftFingerprint: required(
        "draftInfo.fingerprint",
        draftInfo?.fingerprint,
      ),
      approvalFingerprint: required(
        "approvalInfo.fingerprint",
        approvalInfo?.fingerprint,
      ),
    },
    target: {
      domain: required("draftInfo.domain", draftInfo?.domain),
      datacenterCode: required(
        "draftInfo.datacenterCode",
        draftInfo?.datacenterCode,
      ),
      orderReference: `order-****${required(
        "draftInfo.orderId",
        draftInfo?.orderId,
      ).slice(-4)}`,
    },
    hostinger: {
      postEndpoint: "/api/hosting/v1/websites",
      postExecuted: false,
    },
    constraints: {
      connectRepository: false,
      configureDns: false,
      uploadArchive: false,
      startNodeBuild: false,
      deployArtifact: false,
      productionWrites: false,
      wordpressChanges: false,
    },
  };

  return Object.freeze({
    ...body,
    fingerprint: digest(body),
  });
}

export async function readExecutionLock({
  token,
  repository,
  fetchImpl = fetch,
  apiBaseUrl = "https://api.github.com",
}) {
  const url = new URL(
    `${apiBaseUrl}/repos/${required("repository", repository)}/contents/${EXECUTION_LOCK_PATH}`,
  );
  url.searchParams.set("ref", EXECUTION_BRANCH);

  const result = await request({
    fetchImpl,
    url,
    token,
    method: "GET",
    accepted: [200, 404],
  });

  if (result.status === 404) return null;
  return decodeJsonContent(result.payload);
}

export async function claimExecutionLock({
  token,
  repository,
  sourceSha,
  lock,
  fetchImpl = fetch,
  apiBaseUrl = "https://api.github.com",
}) {
  repository = required("repository", repository);
  sourceSha = required("sourceSha", sourceSha);

  if (!/^[a-f0-9]{40}$/.test(sourceSha)) {
    throw new Error("invalid_source_sha");
  }
  if (
    lock?.kind !==
      "hostinger-business-hosting-website-create-execution-lock" ||
    lock.status !== "claimed" ||
    lock.singleUse !== true ||
    lock.executable !== false ||
    lock.hostinger?.postExecuted !== false
  ) {
    throw new Error("invalid_execution_lock");
  }

  const base = `${apiBaseUrl}/repos/${repository}`;
  const ref = await request({
    fetchImpl,
    url: `${base}/git/ref/heads/${EXECUTION_BRANCH}`,
    token,
    method: "GET",
    accepted: [200, 404],
  });

  if (ref.status === 404) {
    await request({
      fetchImpl,
      url: `${base}/git/refs`,
      token,
      method: "POST",
      body: {
        ref: `refs/heads/${EXECUTION_BRANCH}`,
        sha: sourceSha,
      },
      accepted: [201, 422],
    });
  }

  const existing = await readExecutionLock({
    token,
    repository,
    fetchImpl,
    apiBaseUrl,
  });

  if (existing) {
    if (
      existing.source?.draftFingerprint ===
      lock.source.draftFingerprint
    ) {
      return Object.freeze({
        claimed: false,
        reason: "already_claimed",
        existing,
      });
    }
    throw new Error("execution_lock_conflict");
  }

  const written = await request({
    fetchImpl,
    url: `${base}/contents/${EXECUTION_LOCK_PATH}`,
    token,
    method: "PUT",
    body: {
      message: `lock(site-factory): claim Hostinger website creation run ${lock.source.workflowRunId}`,
      content: Buffer.from(
        `${JSON.stringify(lock, null, 2)}\n`,
        "utf8",
      ).toString("base64"),
      branch: EXECUTION_BRANCH,
    },
    accepted: [201],
  });

  return Object.freeze({
    claimed: true,
    branch: EXECUTION_BRANCH,
    path: EXECUTION_LOCK_PATH,
    commitSha: required(
      "written.commit.sha",
      written.payload?.commit?.sha,
    ),
    contentSha: required(
      "written.content.sha",
      written.payload?.content?.sha,
    ),
    lockFingerprint: lock.fingerprint,
  });
}
