const APPROVAL = "IGOR_APROVA_GATEWAY_RUNTIME_BRANCH_20260814";
const OPERATION = "api_gateway_runtime_publish_pinned";
const WORKFLOW = "api-gateway-runtime-publish-pinned.yml";

function fail(message) {
  throw new Error(`ADA gateway runtime dispatch rejected: ${message}`);
}

export function parsePayload(raw) {
  if (typeof raw !== "string" || raw.length < 2 || raw.length > 4096) {
    fail("payload must be a JSON string between 2 and 4096 bytes");
  }
  let payload;
  try { payload = JSON.parse(raw); } catch { fail("payload is not valid JSON"); }
  if (!payload || Array.isArray(payload) || typeof payload !== "object") fail("payload must be a JSON object");

  const allowed = new Set(["operation", "expected_source_sha", "approval", "approved_by", "requested_via"]);
  for (const key of Object.keys(payload)) if (!allowed.has(key)) fail(`unsupported payload key: ${key}`);

  if (String(payload.operation || "") !== OPERATION) fail("unsupported operation");
  const sha = String(payload.expected_source_sha || "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) fail("expected_source_sha must be a 40-character Git SHA");
  if (String(payload.approval || "") !== APPROVAL) fail("approval literal mismatch");
  if (String(payload.approved_by || "") !== "Igor") fail("approved_by must be Igor");
  if (String(payload.requested_via || "") !== "ada-chat") fail("requested_via must be ada-chat");

  return Object.freeze({
    operation: OPERATION,
    workflow: WORKFLOW,
    expected_source_sha: sha,
    approval: APPROVAL,
  });
}

export async function dispatch(resolved, env = process.env) {
  const repository = String(env.GITHUB_REPOSITORY || "");
  const token = String(env.GITHUB_TOKEN || "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail("GITHUB_REPOSITORY is invalid");
  if (!token) fail("GITHUB_TOKEN is missing");
  const [owner, repo] = repository.split("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(resolved.workflow)}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ada-gateway-runtime-dispatch",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: "main",
      inputs: {
        expected_source_sha: resolved.expected_source_sha,
        approval: resolved.approval,
      },
    }),
  });
  if (response.status !== 204) {
    const body = await response.text();
    fail(`workflow dispatch failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  return { ok: true, workflow: resolved.workflow, expected_source_sha: resolved.expected_source_sha };
}

async function main() {
  const resolved = parsePayload(process.env.ADA_GATEWAY_RUNTIME_DISPATCH_PAYLOAD || "");
  console.log(JSON.stringify(await dispatch(resolved)));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
