import test from "node:test";
import assert from "node:assert/strict";
import { createSmapiReader } from "../src/index.mjs";

const skillId = "amzn1.ask.skill.349c8e52-ffbd-4cee-a44a-568e1155145a";
function fakeClient(body = { skills: [] }, status = 200) {
  const calls = [];
  const reader = createSmapiReader({
    getAccessToken: async () => "TEST_TOKEN_NOT_REAL",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    },
  });
  return { calls, reader };
}

test("list skills uses GET only and authorized HTTPS endpoint", async () => {
  const { calls, reader } = fakeClient({ skills: [{ skillId }] });
  const data = await reader.listSkills({ vendorId: "MU6LU6OVDFSVM" });
  assert.equal(data.skills[0].skillId, skillId);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).origin, "https://api.amazonalexa.com");
  assert.equal(new URL(calls[0].url).pathname, "/v1/skills");
  assert.equal(new URL(calls[0].url).searchParams.get("vendorId"), "MU6LU6OVDFSVM");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.redirect, "error");
});

test("list skills accepts bounded pagination", async () => {
  const { calls, reader } = fakeClient();
  await reader.listSkills({ vendorId: "MU6LU6OVDFSVM", maxResults: 50, nextToken: "page" });
  assert.equal(new URL(calls[0].url).searchParams.get("nextToken"), "page");
});
test("vendor ID, page size and continuation token validated", async () => {
  const { reader } = fakeClient();
  await assert.rejects(reader.listSkills({ vendorId: "unsafe/value" }), /invalid_vendor_id/);
  await assert.rejects(reader.listSkills({ vendorId: "ID", maxResults: 51 }), /invalid_max_results/);
  await assert.rejects(reader.listSkills({ vendorId: "ID", nextToken: "" }), /invalid_next_token/);
});
test("get manifest restricted to validated skill stages", async () => {
  const { calls, reader } = fakeClient({ manifest: {} });
  await reader.getManifest({ skillId, stage: "development" });
  assert.equal(new URL(calls[0].url).pathname, `/v1/skills/${skillId}/stages/development/manifest`);
  await assert.rejects(reader.getManifest({ skillId, stage: "certification" }), /invalid_stage/);
  await assert.rejects(reader.getManifest({ skillId: "../x" }), /invalid_skill_id/);
});
test("an absent token blocks requests", async () => {
  let called = false;
  const reader = createSmapiReader({
    getAccessToken: async () => null,
    fetchImpl: async () => { called = true; },
  });
  await assert.rejects(reader.listSkills({ vendorId: "ID" }), /smapi_auth_unavailable/);
  assert.equal(called, false);
});
test("HTTP errors are sanitized without response content", async () => {
  const { reader } = fakeClient({ message: "NEVER_LOG_THIS" }, 401);
  await assert.rejects(reader.listSkills({ vendorId: "ID" }), /^Error: smapi_http_401$/);
});
test("cannot inject an arbitrary HTTP transport", () => {
  assert.throws(() => createSmapiReader({ getAccessToken: async () => "x", fetchImpl: null }), /fetchImpl/);
});
