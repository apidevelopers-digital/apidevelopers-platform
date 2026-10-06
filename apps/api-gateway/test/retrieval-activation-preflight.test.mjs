import test from "node:test";
import assert from "node:assert/strict";

import { createRetrievalActivationPreflight } from "../src/retrieval-activation-preflight.mjs";

function readyRuntime() {
  return Object.freeze({ enabled: true, status: "ready" });
}

test("preflight does not probe providers while feature flag is disabled", async () => {
  let probeCalls = 0;
  const audits = [];
  const preflight = createRetrievalActivationPreflight({
    getKillSwitchState: async () => ({ enabled: false }),
    audit: async (event) => audits.push(event),
    clock: () => "2026-10-06T00:00:00.000Z",
  });

  const result = await preflight.run({
    tenantId: "tenant-test",
    retrievalEnabled: false,
    runtime: readyRuntime(),
    providerProbes: {
      mail: async () => {
        probeCalls += 1;
        return { ok: true, readOnly: true };
      },
    },
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ["feature_flag_disabled"]);
  assert.equal(probeCalls, 0);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].sensitiveContentIncluded, false);
});

test("preflight blocks activation while kill switch is enabled", async () => {
  let probeCalls = 0;
  const preflight = createRetrievalActivationPreflight({
    getKillSwitchState: async () => ({ enabled: true }),
    audit: async () => ({ ok: true }),
  });

  const result = await preflight.run({
    tenantId: "tenant-test",
    retrievalEnabled: true,
    runtime: readyRuntime(),
    providerProbes: {
      mail: async () => {
        probeCalls += 1;
        return { ok: true, readOnly: true };
      },
    },
  });

  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("kill_switch_enabled"));
  assert.equal(probeCalls, 0);
});

test("preflight becomes ready only with healthy read-only probes that read no content", async () => {
  const preflight = createRetrievalActivationPreflight({
    getKillSwitchState: async () => ({ enabled: false }),
    audit: async () => ({ ok: true }),
    clock: () => "2026-10-06T00:00:00.000Z",
  });

  const result = await preflight.run({
    tenantId: "tenant-test",
    retrievalEnabled: true,
    runtime: readyRuntime(),
    providerProbes: {
      mail: async () => ({
        ok: true,
        readOnly: true,
        secretsExposed: false,
        contentRead: false,
        writesPerformed: false,
      }),
      whatsapp: async () => ({
        ok: true,
        read_only: true,
        secrets_exposed: false,
        content_read: false,
        writes_performed: false,
      }),
    },
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.providers.length, 2);
  assert.equal(result.sensitiveContentIncluded, false);
});

test("preflight blocks provider secret exposure, content reads and writes", async () => {
  const preflight = createRetrievalActivationPreflight({
    getKillSwitchState: async () => ({ enabled: false }),
    audit: async () => ({ ok: true }),
  });

  const result = await preflight.run({
    tenantId: "tenant-test",
    retrievalEnabled: true,
    runtime: readyRuntime(),
    providerProbes: {
      unsafe: async () => ({
        ok: true,
        readOnly: false,
        secretsExposed: true,
        contentRead: true,
        writesPerformed: true,
      }),
    },
  });

  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("provider_unsafe_not_read_only"));
  assert.ok(result.blockers.includes("provider_unsafe_secret_exposure"));
  assert.ok(result.blockers.includes("provider_unsafe_content_read_during_preflight"));
  assert.ok(result.blockers.includes("provider_unsafe_write_during_preflight"));
});

test("preflight fails closed when audit is unavailable", async () => {
  const preflight = createRetrievalActivationPreflight({
    getKillSwitchState: async () => ({ enabled: false }),
    audit: async () => {
      throw new Error("audit unavailable");
    },
  });

  await assert.rejects(
    preflight.run({
      tenantId: "tenant-test",
      retrievalEnabled: true,
      runtime: readyRuntime(),
    }),
    (error) => error.code === "RETRIEVAL_PREFLIGHT_AUDIT_FAILED",
  );
});

test("preflight reports runtime_not_ready before probing providers", async () => {
  let probeCalls = 0;
  const preflight = createRetrievalActivationPreflight({
    getKillSwitchState: async () => ({ enabled: false }),
    audit: async () => ({ ok: true }),
  });

  const result = await preflight.run({
    tenantId: "tenant-test",
    retrievalEnabled: true,
    runtime: { enabled: false, status: "disabled" },
    providerProbes: {
      mail: async () => {
        probeCalls += 1;
        return { ok: true, readOnly: true };
      },
    },
  });

  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("runtime_not_ready"));
  assert.equal(probeCalls, 0);
});
