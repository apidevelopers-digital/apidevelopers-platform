import test from "node:test";
import assert from "node:assert/strict";

import { tryHandlePluginRoute } from "../src/plugin-routes.mjs";

function json(response) {
  return JSON.parse(response.body);
}

test("juri capabilities include DataJud async operations", async () => {
  const response = await tryHandlePluginRoute({
    method: "GET",
    url: "/v1/plugins/juri/capabilities",
  });

  assert.equal(response.status, 200);
  const body = json(response);

  assert.ok(body.operations.includes("juri.datajud.status"));
  assert.ok(body.operations.includes("juri.datajud.smoke"));
  assert.ok(body.operations.includes("juri.datajud.request"));
  assert.ok(body.operations.includes("juri.datajud.job.get"));
});

test("juri DataJud job lookup validates job id before calling unico", async () => {
  const response = await tryHandlePluginRoute({
    method: "POST",
    url: "/v1/plugins/juri/call",
    body: JSON.stringify({
      operation: "juri.datajud.job.get",
      dry_run: true,
      payload: {},
    }),
  });

  assert.equal(response.status, 400);
  const body = json(response);

  assert.equal(body.ok, false);
  assert.equal(body.error, "job_id_required");
  assert.equal(body.secretExposed, false);
  assert.equal(body.rawResultIncluded, false);
  assert.equal(body.runtime, "unico.sitedauni.com");
});
