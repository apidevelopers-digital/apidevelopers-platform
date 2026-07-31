
import test from "node:test";
import assert from "node:assert/strict";

import {
  executeApprovedWebsiteCreation,
} from "../src/hostinger-website-create-hostinger.mjs";
import {
  domain,
  json,
  makeApproval,
  makeDraft,
  now,
  repository,
} from "./hostinger-website-create-fixture.mjs";

test("creates the isolated website with exactly one POST", async () => {
  const draft = makeDraft();
  const calls = [];
  let listCount = 0;

  const result = await executeApprovedWebsiteCreation({
    token: "hostinger-token",
    draft,
    approval: makeApproval(draft),
    expectedFingerprint: draft.fingerprint,
    expectedRepository: repository,
    now,
    pollDelayMs: 0,
    sleep: async () => {},
    baseUrl: "https://developers.hostinger.test",
    fetchImpl: async (url, options) => {
      calls.push({
        url: String(url),
        method: options.method,
        body: options.body,
      });

      if (options.method === "GET") {
        listCount += 1;
        return json(
          listCount === 1
            ? { data: [] }
            : {
                data: [
                  {
                    domain,
                    username: "preview-user",
                    order_id: 1009450581,
                    is_enabled: true,
                  },
                ],
              },
        );
      }

      if (options.method === "POST") {
        return new Response("", { status: 201 });
      }

      throw new Error("unexpected_method");
    },
  });

  assert.equal(result.outcome, "created");
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["GET", "POST", "GET"],
  );
  assert.deepEqual(
    JSON.parse(calls.find(({ method }) => method === "POST").body),
    {
      domain,
      order_id: "1009450581",
      datacenter_code: "ascenty",
    },
  );
  assert.doesNotMatch(JSON.stringify(result), /hostinger-token/);
});

test("does not POST when the website already exists", async () => {
  const draft = makeDraft();
  const calls = [];

  const result = await executeApprovedWebsiteCreation({
    token: "hostinger-token",
    draft,
    approval: makeApproval(draft),
    expectedFingerprint: draft.fingerprint,
    expectedRepository: repository,
    now,
    fetchImpl: async (_url, options) => {
      calls.push(options.method);
      return json({ data: [{ domain, username: "existing-user" }] });
    },
  });

  assert.equal(result.outcome, "already_exists");
  assert.equal(result.hostingerPostExecuted, false);
  assert.deepEqual(calls, ["GET"]);
});
