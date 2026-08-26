import test from "node:test";
import assert from "node:assert/strict";

import {
  UNIJURI_REMOTE_SIGNER_HTTPS_TRANSPORT_CONTRACT,
  createUniJuriRemoteSignerHttpsTransport,
} from "../src/saas-unijuri-delegated-binding-remote-signer-https-transport.mjs";

function jsonResponse(body, status = 200) {
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    status,
    headers: { get(name) { return String(name).toLowerCase() === "content-type" ? "application/json" : null; } },
    async arrayBuffer() { return bytes; },
  };
}

test("UniJuri remote signer HTTPS transport is exact-endpoint and POST-only by construction", async () => {
  const calls = [];
  const transport = createUniJuriRemoteSignerHttpsTransport({
    endpoint: "https://signer.example.test/v1/unijuri/delegated-binding/sign",
    credentialProvider: async ({ purpose }) => {
      assert.equal(purpose, "uni-juri.delegated-binding.remote-signer");
      return { scheme: "bearer", bytes: Buffer.from("0123456789abcdef-test-token") };
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ version: "uni-juri-delegated-binding/v1", algorithm: "RSA-PSS-SHA256", keyId: "k1", proof: "a.b", expiresAt: "2026-08-26T18:01:00.000Z" });
    },
  });

  const response = await transport.sign({ operation: "sign-unijuri-delegated-binding" });
  assert.equal(response.keyId, "k1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://signer.example.test/v1/unijuri/delegated-binding/sign");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.credentials, "omit");
  assert.match(calls[0].init.headers.authorization, /^Bearer /);
  assert.equal(calls[0].init.headers["content-type"], "application/json");
});

test("UniJuri remote signer HTTPS transport rejects unsafe endpoint shapes", () => {
  const credentialProvider = async () => ({ scheme: "bearer", bytes: Buffer.from("0123456789abcdef") });
  for (const endpoint of [
    "http://signer.example.test/v1/unijuri/delegated-binding/sign",
    "https://127.0.0.1/v1/unijuri/delegated-binding/sign",
    "https://user:pass@signer.example.test/v1/unijuri/delegated-binding/sign",
    "https://signer.example.test/v1/unijuri/delegated-binding/sign?x=1",
    "https://signer.example.test/other",
  ]) {
    assert.throws(() => createUniJuriRemoteSignerHttpsTransport({ endpoint, credentialProvider }), /endpoint/);
  }
});

test("UniJuri remote signer HTTPS transport fails closed on redirects and non-JSON", async () => {
  const credentialProvider = async () => ({ scheme: "bearer", bytes: Buffer.from("0123456789abcdef") });
  const redirected = createUniJuriRemoteSignerHttpsTransport({
    endpoint: "https://signer.example.test/v1/unijuri/delegated-binding/sign",
    credentialProvider,
    fetchImpl: async () => ({ status: 302, headers: { get() { return "application/json"; } }, async arrayBuffer() { return Buffer.from("{}"); } }),
  });
  await assert.rejects(redirected.sign({}), /remote_signer_redirect_denied/);

  const nonJson = createUniJuriRemoteSignerHttpsTransport({
    endpoint: "https://signer.example.test/v1/unijuri/delegated-binding/sign",
    credentialProvider,
    fetchImpl: async () => ({ status: 200, headers: { get() { return "text/plain"; } }, async arrayBuffer() { return Buffer.from("ok"); } }),
  });
  await assert.rejects(nonJson.sign({}), /remote_signer_content_type_invalid/);
});

test("UniJuri remote signer HTTPS transport contract remains narrow", () => {
  assert.deepEqual(UNIJURI_REMOTE_SIGNER_HTTPS_TRANSPORT_CONTRACT, {
    method: "POST",
    path: "/v1/unijuri/delegated-binding/sign",
    scheme: "https",
    credentialPurpose: "uni-juri.delegated-binding.remote-signer",
    redirects: "denied",
    query: "denied",
    literalIpHosts: "denied",
    maxBodyBytes: 32768,
    maxResponseBytes: 32768,
  });
});
