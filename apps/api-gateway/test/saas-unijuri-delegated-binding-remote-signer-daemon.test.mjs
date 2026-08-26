import test from "node:test";
import assert from "node:assert/strict";

import {
  UNIJURI_REMOTE_SIGNER_DAEMON_CONTRACT,
  startUniJuriRemoteSignerDaemon,
} from "../src/saas-unijuri-delegated-binding-remote-signer-daemon.mjs";

function service() {
  return {
    async sign(request) {
      return {
        version: "uni-juri-delegated-binding/v1",
        algorithm: "RSA-PSS-SHA256",
        keyId: "unijuri-binding-test-v1",
        proof: request?.proof ?? "a.b",
        expiresAt: "2026-08-26T20:00:00.000Z",
      };
    },
  };
}

test("UniJuri remote signer daemon requires bearer auth on sign endpoint", async () => {
  const daemon = await startUniJuriRemoteSignerDaemon({
    service: service(),
    bearerTokenProvider: async () => "0123456789abcdef-test-token",
    port: 0,
  });
  const { port } = daemon.address;

  try {
    const missing = await fetch(`http://127.0.0.1:${port}${UNIJURI_REMOTE_SIGNER_DAEMON_CONTRACT.signPath}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(missing.status, 401);

    const wrong = await fetch(`http://127.0.0.1:${port}${UNIJURI_REMOTE_SIGNER_DAEMON_CONTRACT.signPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-token-value",
      },
      body: "{}",
    });
    assert.equal(wrong.status, 403);

    const ok = await fetch(`http://127.0.0.1:${port}${UNIJURI_REMOTE_SIGNER_DAEMON_CONTRACT.signPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer 0123456789abcdef-test-token",
      },
      body: JSON.stringify({ proof: "x.y" }),
    });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).proof, "x.y");
  } finally {
    await daemon.close();
  }
});

test("UniJuri remote signer daemon remains loopback-only", async () => {
  await assert.rejects(
    () => startUniJuriRemoteSignerDaemon({
      service: service(),
      bearerTokenProvider: async () => "0123456789abcdef-test-token",
      host: "0.0.0.0",
      port: 0,
    }),
    /remote_signer_external_bind_not_authorized/,
  );
});

test("UniJuri remote signer daemon exposes non-sensitive health", async () => {
  const daemon = await startUniJuriRemoteSignerDaemon({
    service: service(),
    bearerTokenProvider: async () => "0123456789abcdef-test-token",
    port: 0,
  });
  const { port } = daemon.address;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, "uni-juri-remote-signer");
  } finally {
    await daemon.close();
  }
});
