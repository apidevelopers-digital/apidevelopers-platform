import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDatacenterEvidence,
  publishDatacenterEvidence,
} from "../src/hostinger-datacenter-evidence.mjs";

const sha = "6dd10804e3eea70cc36c3b09be14e75225a55289";
const base = () => ({
  kind: "hostinger-business-hosting-preview-preflight",
  product: "business-web-hosting",
  mode: "read-only",
  executable: false,
  writesEnabled: false,
  provisioningEnabled: false,
  dnsEnabled: false,
  deployEnabled: false,
  readyForProvisioningApproval: true,
  checkedAt: "2026-07-31T02:00:00.000Z",
  orderReference: "order-***0581",
  fingerprint: "preflight-fingerprint",
  datacenters: [
    { code: "us-1", title: "United States" },
    { code: "br-1", title: "Brazil" },
  ],
});
const make = () =>
  buildDatacenterEvidence({
    preflight: base(),
    repository: "apidevelopers-digital/apidevelopers-platform",
    sha,
    runId: "30595153351",
    generatedAt: "2026-07-31T02:05:00.000Z",
  });

test("builds deterministic sanitized evidence", () => {
  const first = make();
  const second = make();
  assert.equal(first.executable, false);
  assert.equal(first.hostingerWrites, false);
  assert.equal(first.source.orderReference, "order-****0581");
  assert.deepEqual(first.datacenters.map(({ code }) => code), ["br-1", "us-1"]);
  assert.equal(first.fingerprint, second.fingerprint);
});

test("rejects write-enabled preflight", () => {
  assert.throws(
    () =>
      buildDatacenterEvidence({
        preflight: { ...base(), writesEnabled: true },
        repository: "apidevelopers-digital/apidevelopers-platform",
        sha,
        runId: "1",
      }),
    /unsafe_or_incomplete_preflight/,
  );
});

test("creates branch and writes evidence through GitHub REST API", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), ...options });
    if (String(url).includes("/git/ref/heads/")) {
      return new Response("", { status: 404 });
    }
    if (String(url).endsWith("/git/refs")) {
      return Response.json({}, { status: 201 });
    }
    if (options.method === "GET") {
      return new Response("", { status: 404 });
    }
    return Response.json(
      { commit: { sha: "commit" }, content: { sha: "content" } },
      { status: 201 },
    );
  };

  const result = await publishDatacenterEvidence({
    token: "github-token",
    repository: "apidevelopers-digital/apidevelopers-platform",
    sourceSha: sha,
    evidence: make(),
    fetchImpl,
    api: "https://api.github.test",
  });

  assert.equal(result.commitSha, "commit");
  assert.deepEqual(calls.map(({ method }) => method), [
    "GET",
    "POST",
    "GET",
    "PUT",
  ]);
  const written = JSON.parse(calls[3].body);
  assert.doesNotMatch(
    Buffer.from(written.content, "base64").toString("utf8"),
    /github-token/,
  );
});

test("updates current evidence with the current content SHA", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), ...options });
    if (String(url).includes("/git/ref/heads/")) {
      return Response.json({}, { status: 200 });
    }
    if (options.method === "GET") {
      return Response.json({ sha: "old" }, { status: 200 });
    }
    return Response.json(
      { commit: { sha: "commit" }, content: { sha: "content" } },
      { status: 200 },
    );
  };

  await publishDatacenterEvidence({
    token: "github-token",
    repository: "apidevelopers-digital/apidevelopers-platform",
    sourceSha: sha,
    evidence: make(),
    fetchImpl,
    api: "https://api.github.test",
  });

  assert.equal(JSON.parse(calls[2].body).sha, "old");
});
