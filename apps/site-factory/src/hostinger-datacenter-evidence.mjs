import crypto from "node:crypto";

const BRANCH = "evidence/hostinger-datacenters";
const FILE = "apps/site-factory/evidence/hostinger-datacenters-latest.json";

function req(name, value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function assertPreflight(report) {
  const safe =
    report?.kind === "hostinger-business-hosting-preview-preflight" &&
    report.product === "business-web-hosting" &&
    report.mode === "read-only" &&
    report.executable === false &&
    report.writesEnabled === false &&
    report.provisioningEnabled === false &&
    report.dnsEnabled === false &&
    report.deployEnabled === false &&
    report.readyForProvisioningApproval === true &&
    Array.isArray(report.datacenters) &&
    report.datacenters.length > 0;

  if (!safe) throw new Error("unsafe_or_incomplete_preflight");
}

export function buildDatacenterEvidence({
  preflight,
  repository,
  sha,
  runId,
  generatedAt = new Date().toISOString(),
}) {
  assertPreflight(preflight);
  repository = req("repository", repository);
  sha = req("sha", sha);
  runId = req("runId", String(runId ?? ""));

  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("invalid_sha");

  const orderSuffix = req("orderReference", preflight.orderReference).match(
    /([0-9]{4})$/,
  )?.[1];
  if (!orderSuffix) throw new Error("invalid_order_reference");

  const datacenters = preflight.datacenters
    .map((item) => ({
      code: req("datacenter.code", item?.code),
      title: req("datacenter.title", item?.title),
      coordinates:
        Number.isFinite(Number(item?.coordinates?.latitude)) &&
        Number.isFinite(Number(item?.coordinates?.longitude))
          ? {
              latitude: Number(item.coordinates.latitude),
              longitude: Number(item.coordinates.longitude),
            }
          : null,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const body = {
    schemaVersion: "1.0",
    kind: "hostinger-business-hosting-datacenter-evidence",
    mode: "api-root-evidence",
    executable: false,
    hostingerWrites: false,
    githubEvidenceWrite: true,
    generatedAt,
    provider: "hostinger",
    product: "business-web-hosting",
    source: {
      repository,
      sha,
      workflowRunId: runId,
      preflightFingerprint: req("preflightFingerprint", preflight.fingerprint),
      checkedAt: req("checkedAt", preflight.checkedAt),
      orderReference: `order-****${orderSuffix}`,
    },
    datacenters,
    constraints: {
      sourceMethod: "GET",
      sourceEndpoint: "/api/hosting/v1/datacenters?order_id={order_id}",
      createWebsiteExecuted: false,
      dnsChanged: false,
      buildStarted: false,
      deployExecuted: false,
      productionChanged: false,
      wordpressChanged: false,
    },
  };

  return Object.freeze({
    ...body,
    fingerprint: crypto
      .createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex"),
  });
}

async function request(fetchImpl, url, token, options, accepted) {
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${req("token", token)}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!accepted.includes(response.status)) {
    throw new Error(
      `github_api_failed:${options.method}:${response.status}:${response.statusText}`,
    );
  }
  return { status: response.status, payload };
}

export async function publishDatacenterEvidence({
  token,
  repository,
  sourceSha,
  evidence,
  fetchImpl = fetch,
  api = "https://api.github.com",
}) {
  repository = req("repository", repository);
  sourceSha = req("sourceSha", sourceSha);
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("invalid_sha");

  const base = `${api}/repos/${repository}`;
  const ref = await request(
    fetchImpl,
    `${base}/git/ref/heads/${BRANCH}`,
    token,
    { method: "GET" },
    [200, 404],
  );

  if (ref.status === 404) {
    await request(
      fetchImpl,
      `${base}/git/refs`,
      token,
      {
        method: "POST",
        body: { ref: `refs/heads/${BRANCH}`, sha: sourceSha },
      },
      [201],
    );
  }

  const currentUrl = new URL(`${base}/contents/${FILE}`);
  currentUrl.searchParams.set("ref", BRANCH);
  const current = await request(
    fetchImpl,
    currentUrl,
    token,
    { method: "GET" },
    [200, 404],
  );

  const body = {
    message: `evidence(site-factory): datacenters Hostinger run ${evidence.source.workflowRunId}`,
    content: Buffer.from(
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    ).toString("base64"),
    branch: BRANCH,
  };
  if (current.status === 200) body.sha = req("current.sha", current.payload?.sha);

  const written = await request(
    fetchImpl,
    `${base}/contents/${FILE}`,
    token,
    { method: "PUT", body },
    [200, 201],
  );

  return Object.freeze({
    branch: BRANCH,
    path: FILE,
    commitSha: req("commit.sha", written.payload?.commit?.sha),
    contentSha: req("content.sha", written.payload?.content?.sha),
  });
}
