import test from "node:test";
import assert from "node:assert/strict";

import { createSecretHandoffService } from "../src/secret-handoff.mjs";
import { createOperatorSecretHandoffHttpApp } from "../src/operator-secret-handoff-http.mjs";

function fixture({ scopes = ["admin:*"], effect = "allow" } = {}) {
  const handoffService = createSecretHandoffService({
    ttlMs: 60_000,
    idFactory: () => "session-http-001",
    tokenFactory: () => "submit-token-http-001",
  });
  const created = handoffService.create({ purpose: "hostinger.mysql.create" });
  const app = {
    async handleRequest() {
      return { status: 404, headers: {}, body: "{}" };
    },
  };
  const authenticator = {
    async authenticate() {
      return { role: "operator", principal: { id: "igor", scopes } };
    },
  };
  const authorization = {
    decide(input) {
      assert.equal(input.action, "operator.secret-handoff.submit");
      return { effect };
    },
  };
  return {
    handoffService,
    created,
    http: createOperatorSecretHandoffHttpApp({ app, authenticator, authorization, handoffService }),
  };
}

function request(created, body, headers = {}) {
  return {
    method: "POST",
    url: `/v1/operator/secret-handoff/${created.sessionId}/submit`,
    headers: {
      "content-type": "application/octet-stream",
      "x-secret-handoff-token": created.submitToken,
      ...headers,
    },
    body,
  };
}

test("protected binary surface accepts secret without returning it and wipes request bytes", async () => {
  const { http, created, handoffService } = fixture();
  const body = Buffer.from("temporary-hostinger-db-password", "utf8");

  const response = await http.handleRequest(request(created, body));
  assert.equal(response.status, 202);
  const payload = JSON.parse(response.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.secretReturned, false);
  assert.equal("secret" in payload, false);
  assert.equal(body.every((value) => value === 0), true);
  assert.equal(handoffService.status(created.sessionId).state, "secret_received");
});

test("surface requires authenticated admin wildcard and authorization allow", async () => {
  const noScope = fixture({ scopes: ["operator:resource:read"] });
  const denied = await noScope.http.handleRequest(request(noScope.created, Buffer.from("secret")));
  assert.equal(denied.status, 403);
  assert.equal(noScope.handoffService.status(noScope.created.sessionId).state, "waiting_secret");

  const policyDenied = fixture({ effect: "deny" });
  const deniedByPolicy = await policyDenied.http.handleRequest(request(policyDenied.created, Buffer.from("secret")));
  assert.equal(deniedByPolicy.status, 403);
  assert.equal(policyDenied.handoffService.status(policyDenied.created.sessionId).state, "waiting_secret");
});

test("surface rejects JSON so secret is not parsed into an immutable JSON string", async () => {
  const { http, created, handoffService } = fixture();
  const body = Buffer.from('{"secret":"must-not-be-parsed"}', "utf8");
  const response = await http.handleRequest(request(created, body, {
    "content-type": "application/json",
  }));
  assert.equal(response.status, 415);
  assert.equal(handoffService.status(created.sessionId).state, "waiting_secret");
});

test("invalid one-time token does not accept secret and response does not echo token", async () => {
  const { http, created, handoffService } = fixture();
  const body = Buffer.from("temporary-password");
  const response = await http.handleRequest(request(created, body, {
    "x-secret-handoff-token": "wrong-token",
  }));
  assert.equal(response.status, 401);
  assert.equal(response.body.includes("wrong-token"), false);
  assert.equal(body.every((value) => value === 0), true);
  assert.equal(handoffService.status(created.sessionId).state, "waiting_secret");
});

test("second submission fails closed", async () => {
  const { http, created } = fixture();
  assert.equal((await http.handleRequest(request(created, Buffer.from("first-secret")))).status, 202);
  const second = await http.handleRequest(request(created, Buffer.from("second-secret")));
  assert.equal(second.status, 409);
  assert.equal(JSON.parse(second.body).error, "secret_handoff_already_submitted");
});
