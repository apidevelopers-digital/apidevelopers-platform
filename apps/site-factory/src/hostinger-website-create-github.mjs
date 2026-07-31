
const EXECUTION_BRANCH = "evidence/hostinger-website-create-execution";
const EXECUTION_PATH =
  "apps/site-factory/evidence/hostinger-website-create-execution-latest.json";

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
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

export async function readGithubJson({
  token,
  repository,
  ref,
  path,
  fetchImpl = fetch,
  apiBaseUrl = "https://api.github.com",
}) {
  const url = new URL(
    `${apiBaseUrl}/repos/${required("repository", repository)}/contents/${required("path", path)}`,
  );
  url.searchParams.set("ref", required("ref", ref));
  const result = await request({
    fetchImpl,
    url,
    token,
    method: "GET",
    accepted: [200],
  });
  const encoded = required("content", result.payload?.content).replace(/\s+/g, "");
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

export async function readExecutionEvidence({
  token,
  repository,
  fetchImpl = fetch,
  apiBaseUrl = "https://api.github.com",
}) {
  const url = new URL(
    `${apiBaseUrl}/repos/${repository}/contents/${EXECUTION_PATH}`,
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
  const encoded = required("content", result.payload?.content).replace(/\s+/g, "");
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

export async function publishExecutionEvidence({
  token,
  repository,
  sourceSha,
  evidence,
  fetchImpl = fetch,
  apiBaseUrl = "https://api.github.com",
}) {
  const base =
    `${apiBaseUrl}/repos/${required("repository", repository)}`;

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
        sha: required("sourceSha", sourceSha),
      },
      accepted: [201],
    });
  }

  const currentUrl = new URL(`${base}/contents/${EXECUTION_PATH}`);
  currentUrl.searchParams.set("ref", EXECUTION_BRANCH);
  const current = await request({
    fetchImpl,
    url: currentUrl,
    token,
    method: "GET",
    accepted: [200, 404],
  });

  const body = {
    message:
      `evidence(site-factory): website preview ${evidence.outcome} run ${evidence.source.workflowRunId}`,
    content: Buffer.from(
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    ).toString("base64"),
    branch: EXECUTION_BRANCH,
  };
  if (current.status === 200) {
    body.sha = required("current.sha", current.payload?.sha);
  }

  const written = await request({
    fetchImpl,
    url: `${base}/contents/${EXECUTION_PATH}`,
    token,
    method: "PUT",
    body,
    accepted: [200, 201],
  });

  return Object.freeze({
    branch: EXECUTION_BRANCH,
    path: EXECUTION_PATH,
    commitSha: required("written.commit.sha", written.payload?.commit?.sha),
    contentSha: required("written.content.sha", written.payload?.content?.sha),
  });
}
