import assert from "node:assert/strict";
import test from "node:test";

import { toOperationalResponse } from "../src/web-agent-operational-composition.mjs";

test("web agent operational response preserves HTTP headers and body for the transport", () => {
  const body = JSON.stringify({
    ok: false,
    error: "access_context_required",
  });
  const response = toOperationalResponse({
    status: 400,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body,
  });

  assert.equal(response.status, 400);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.body, body);
  assert.deepEqual(response.payload, {
    ok: false,
    error: "access_context_required",
  });
});

test("web agent operational response converts invalid HTTP shapes into a JSON 502", () => {
  const response = toOperationalResponse({
    status: 400,
    headers: {},
  });

  assert.equal(response.status, 502);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(response.body), {
    error: "invalid_web_agent_http_response",
  });
  assert.deepEqual(response.payload, {
    error: "invalid_web_agent_http_response",
  });
});
