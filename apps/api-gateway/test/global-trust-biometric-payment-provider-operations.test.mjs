import assert from "node:assert/strict";
import test from "node:test";
import { createBiometricPaymentProviderOperations } from "../src/global-trust-biometric-payment-provider-operations.mjs";

const sink = (target) => Object.freeze({ async append(value) { target.push(value); return true; } });

function fakeControl(impl = null) {
  let calls = 0;
  let killSwitch = false;
  let killReason = null;
  return {
    control: Object.freeze({
      providerName: "provider-neutral-sandbox",
      providerMode: "sandbox",
      async authorize(request) {
        calls += 1;
        if (killSwitch) {
          const error = new Error("kill switch");
          error.code = "TRUST_PAYMENT_PROVIDER_KILL_SWITCH";
          throw error;
        }
        if (impl) return impl({ request, calls });
        return { status: "authorized", providerReference: `sandbox.${request.idempotencyKey}`, financialExecutionOccurred: false };
      },
      async health() { return { status: "healthy" }; },
      async readiness() { return { ready: true }; },
      engageKillSwitch(reason) { killSwitch = true; killReason = reason; return { disabled: true, reason }; },
      status() { return { enabledByPolicy: true, allowedMode: true, killSwitch, killReason }; },
    }),
    calls: () => calls,
  };
}

const request = (overrides = {}) => ({
  paymentIntentId: "payment.intent.ops.001",
  tenantId: "tenant.uni",
  subjectId: "subject.igor",
  amountMinor: 12990,
  currency: "BRL",
  idempotencyKey: "payment.intent.ops.001",
  correlationId: "corr.payment.ops.001",
  ...overrides,
});

test("successful authorization emits sanitized telemetry", async () => {
  const telemetry = [];
  const { control, calls } = fakeControl();
  let clock = 1000;
  const ops = createBiometricPaymentProviderOperations({
    control,
    telemetrySink: sink(telemetry),
    nowMs: () => clock++,
  });

  const result = await ops.authorize(request({
    secretProbe: "SECRET_SHOULD_NOT_LEAK",
    biometricTemplate: "BIOMETRIC_SHOULD_NOT_LEAK",
  }));

  assert.equal(result.status, "authorized");
  assert.equal(calls(), 1);
  const status = ops.status();
  assert.equal(status.circuit.state, "closed");
  assert.equal(status.counters.authorizeSucceeded, 1);
  assert.equal(status.sensitiveContentIncluded, false);

  const serialized = JSON.stringify(telemetry);
  for (const forbidden of ["SECRET_SHOULD_NOT_LEAK", "BIOMETRIC_SHOULD_NOT_LEAK", "subject.igor", "12990"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(telemetry.every((event) => event.sensitiveContentIncluded === false), true);
});

test("circuit opens, blocks contact, then half-open success closes it", async () => {
  let clock = 10000;
  const telemetry = [];
  const incidents = [];
  const { control, calls } = fakeControl(({ calls: current }) => {
    if (current <= 2) {
      const error = new Error("upstream transport failed");
      error.code = "TRUST_PAYMENT_PROVIDER_UPSTREAM_TRANSPORT";
      error.retryable = true;
      throw error;
    }
    return { status: "authorized", providerReference: "sandbox.recovered", financialExecutionOccurred: false };
  });

  const ops = createBiometricPaymentProviderOperations({
    control,
    telemetrySink: sink(telemetry),
    incidentSink: sink(incidents),
    policy: { failureThreshold: 2, cooldownMs: 500, autoKillSwitchAfterOpenCount: 3 },
    nowMs: () => clock,
  });

  await assert.rejects(ops.authorize(request({ correlationId: "corr.1" })));
  await assert.rejects(ops.authorize(request({ correlationId: "corr.2" })));
  assert.equal(ops.status().circuit.state, "open");
  assert.equal(calls(), 2);

  await assert.rejects(
    ops.authorize(request({ correlationId: "corr.blocked" })),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_CIRCUIT_OPEN",
  );
  assert.equal(calls(), 2);

  clock += 501;
  assert.equal((await ops.authorize(request({ correlationId: "corr.recovery" }))).status, "authorized");
  assert.equal(ops.status().circuit.state, "closed");
  assert.equal(ops.status().circuit.consecutiveFailures, 0);
  assert.equal(incidents.some((event) => event.type === "trust.payment.provider.circuit_opened"), true);
  assert.equal(telemetry.some((event) => event.type === "trust.payment.provider.circuit_half_open"), true);
  assert.equal(telemetry.some((event) => event.type === "trust.payment.provider.circuit_closed"), true);
});

test("repeated circuit openings engage the existing provider kill switch", async () => {
  let clock = 20000;
  const incidents = [];
  const { control } = fakeControl(() => {
    const error = new Error("upstream unavailable");
    error.code = "TRUST_PAYMENT_PROVIDER_UPSTREAM_UNAVAILABLE";
    error.retryable = true;
    throw error;
  });

  const ops = createBiometricPaymentProviderOperations({
    control,
    incidentSink: sink(incidents),
    policy: { failureThreshold: 1, cooldownMs: 200, autoKillSwitchAfterOpenCount: 2 },
    nowMs: () => clock,
  });

  await assert.rejects(ops.authorize(request({ correlationId: "corr.open.1" })));
  clock += 201;
  await assert.rejects(ops.authorize(request({ correlationId: "corr.open.2" })));

  const status = ops.status();
  assert.equal(status.circuit.openCount, 2);
  assert.equal(status.control.killSwitch, true);
  assert.equal(status.control.killReason, "incident.provider_repeated_failure");
  assert.equal(status.counters.killSwitchEngaged, 1);
  assert.equal(incidents.some((event) => event.type === "trust.payment.provider.kill_switch_engaged"), true);
});

test("local policy failures do not poison circuit; health/readiness remain observable", async () => {
  const telemetry = [];
  const { control } = fakeControl(() => {
    const error = new Error("amount limit");
    error.code = "TRUST_PAYMENT_PROVIDER_AMOUNT_LIMIT";
    throw error;
  });
  const ops = createBiometricPaymentProviderOperations({
    control,
    telemetrySink: sink(telemetry),
    policy: { failureThreshold: 1 },
  });

  await assert.rejects(
    ops.authorize(request()),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_AMOUNT_LIMIT",
  );
  assert.equal(ops.status().circuit.state, "closed");
  assert.equal(ops.status().circuit.consecutiveFailures, 0);

  assert.equal((await ops.health()).status, "healthy");
  assert.equal((await ops.readiness()).ready, true);
  assert.equal(ops.status().counters.healthChecks, 1);
  assert.equal(ops.status().counters.readinessChecks, 1);
  const failure = telemetry.find((event) => event.type === "trust.payment.provider.authorize_failed");
  assert.equal(failure.providerFailure, false);
});

test("manual circuit reset does not silently reset provider kill switch", async () => {
  const incidents = [];
  const { control } = fakeControl();
  control.engageKillSwitch("manual.incident");

  const ops = createBiometricPaymentProviderOperations({
    control,
    incidentSink: sink(incidents),
  });

  const reset = await ops.resetCircuit("operator.reviewed");
  assert.equal(reset.circuit.state, "closed");
  assert.equal(reset.control.killSwitch, true);
  assert.equal(reset.control.killReason, "manual.incident");
  assert.equal(incidents.some((event) => event.type === "trust.payment.provider.circuit_reset"), true);
});
