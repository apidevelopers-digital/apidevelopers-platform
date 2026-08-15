import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createWebAgentShadowConversationService,
  webAgentShadowEndpointPath,
} from "../src/web-agent-shadow-client.mjs";

const FIXTURE_URL = new URL("./fixtures/web-agent-shadow-wire-v1.json", import.meta.url);
const API_KEY = "wire-contract-test-key";

async function loadFixture() {
  return JSON.parse(await readFile(FIXTURE_URL, "utf8"));
}

function response(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
  };
}

test("canonical shadow wire fixture is versioned and matches the client endpoint", async () => {
  const fixture = await loadFixture();
  assert.equal(fixture.version, "web-agent-shadow-wire-v1");
  assert.equal(fixture.endpointPath, webAgentShadowEndpointPath);
  assert.equal(fixture.vectors.length, 2);
});

test("gateway serializes uni.co and NEXUS exactly to the canonical wire vectors", async () => {
  const fixture = await loadFixture();

  for (const vector of fixture.vectors) {
    const calls = [];
    const service = createWebAgentShadowConversationService({
      baseUrl: "https://wire-bridge.example/",
      apiKey: API_KEY,
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        return response(vector.upstreamResponse);
      },
    });

    const output = await service.handle(vector.gatewayEnvelope);

    assert.equal(calls.length, 1, vector.name);
    const call = calls[0];
    assert.equal(call.url, `https://wire-bridge.example${fixture.endpointPath}`, vector.name);
    assert.equal(call.options.headers["x-unico-api-key"], API_KEY, vector.name);

    for (const [name, value] of Object.entries(vector.upstreamHeaders)) {
      assert.equal(call.options.headers[name], value, `${vector.name}:${name}`);
    }

    const body = JSON.parse(call.options.body);
    assert.deepEqual(body, vector.upstreamRequest, vector.name);
    assert.equal("productId" in body, false, vector.name);
    assert.equal("principalId" in body, false, vector.name);
    assert.equal("sessionId" in body, false, vector.name);

    assert.deepEqual(output, vector.expectedGatewayOutput, vector.name);
  }
});
