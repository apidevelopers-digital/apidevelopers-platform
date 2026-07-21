
import assert from "node:assert/strict";
import { ReadApiClient } from "../public/api-client.js";

const originalFetch = globalThis.fetch;

try {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          data: {
            summary: { title: "Instituição" },
            records: [{ id: "record-1" }],
            modules: [],
            versions: [],
            integrity: { status: "healthy", sources: [] },
          },
          meta: { projectionVersion: "institutional-v1", stale: false },
        };
      },
    };
  };

  const client = new ReadApiClient({
    baseUrl: "https://gateway.example.test/",
    apiKey: "read-key",
  });

  const institutional = await client.institutionalSnapshot();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://gateway.example.test/v1/portal/snapshot");
  assert.deepEqual(calls[0].options, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-key": "read-key",
    },
    credentials: "omit",
    cache: "no-store",
  });
  assert.equal(institutional.records.length, 1);
  assert.equal(institutional.meta.projectionVersion, "institutional-v1");

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        sections: {
          memories: [{ id: "memory-1" }],
          findings: [{ id: "finding-1" }],
          proposals: [{ id: "proposal-1", status: "pending" }],
          evidence: [{ id: "evidence-1" }],
        },
        meta: { projectionVersion: "learning-v1" },
      };
    },
  });

  const learning = await client.learningSnapshot();
  assert.equal(learning.memories.length, 1);
  assert.equal(learning.findings.length, 1);
  assert.equal(learning.proposals[0].status, "pending");
  assert.equal(learning.evidence.length, 1);

  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    async json() {
      return { error: { code: "ACCESS_DENIED" } };
    },
  });

  await assert.rejects(
    () => client.institutionalSnapshot(),
    (error) => {
      assert.equal(error.message, "ACCESS_DENIED");
      assert.equal(error.status, 403);
      assert.deepEqual(error.payload, { error: { code: "ACCESS_DENIED" } });
      return true;
    },
  );

  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    async json() {
      throw new Error("invalid json");
    },
  });

  await assert.rejects(
    () => client.learningSnapshot(),
    (error) => {
      assert.equal(error.message, "HTTP_502");
      assert.equal(error.status, 502);
      assert.equal(error.payload, null);
      return true;
    },
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("developer-portal read api client behavior: ok");
