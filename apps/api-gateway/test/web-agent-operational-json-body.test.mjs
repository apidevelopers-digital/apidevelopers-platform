import assert from "node:assert/strict";
import test from "node:test";

import { parseOperationalConversationBody } from "../src/web-agent-operational-composition.mjs";

test("operational conversation parses JSON string into an object", () => {
  const parsed = parseOperationalConversationBody(
    JSON.stringify({
      productId: "product:uni-co",
      workspaceId: "workspace_1",
      accessGrantId: "grant_1",
    }),
  );

  assert.deepEqual(parsed, {
    productId: "product:uni-co",
    workspaceId: "workspace_1",
    accessGrantId: "grant_1",
  });
});

test("operational conversation preserves an already parsed object", () => {
  const body = { productId: "product:uni-co" };
  assert.equal(parseOperationalConversationBody(body), body);
});

test("operational conversation rejects invalid JSON shapes", () => {
  assert.throws(() => parseOperationalConversationBody(""), /invalid_json/);
  assert.throws(() => parseOperationalConversationBody("{not-json"), /invalid_json/);
  assert.throws(() => parseOperationalConversationBody("123"), /invalid_json/);
  assert.throws(() => parseOperationalConversationBody([]), /invalid_json/);
});
