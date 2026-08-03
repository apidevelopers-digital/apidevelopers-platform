import assert from "node:assert/strict";
import test from "node:test";

import {
  OperatorSecretResolverProviderError,
  createOperatorSecretResolverProvider,
} from "../src/operator-secret-resolver-provider.mjs";
import {
  withOperatorSecret,
} from "../src/operator-secret-provider-contract.mjs";

function token520() {
  return `ghs_${"A".repeat(516)}`;
}

test("resolver provider normalizes access, leases opaque bytes and zeroes its internal copy", async () => {
  const token = token520();
  const sourceBytes = Buffer.from(token, "utf8");
  let observedAccess;
  let observedSignal;
  let leasedBytes;

  const provider = createOperatorSecretResolverProvider({
    now: () => Date.parse("2026-08-02T23:00:00.000Z"),
    resolveSecret(access, context) {
      observedAccess = access;
      observedSignal = context.signal;
      return {
        bytes: sourceBytes,
        version: "github-installation-v1",
        expiresAt: "2026-08-02T23:05:00.000Z",
      };
    },
  });

  const result = await provider.withSecret(
    {
      secretRef: "vault://github/operator-readonly-installation-token",
      purpose: "github.readonly.organization.get",
      correlationId: "corr_wave5_001",
      tenantId: "uni.operator",
    },
    async (lease) => {
      leasedBytes = lease.bytes;
      assert.equal(lease.bytes.byteLength, 520);
      assert.equal(Buffer.from(lease.bytes).toString("utf8"), token);
      assert.equal(lease.version, "github-installation-v1");
      assert.equal(lease.expiresAt, "2026-08-02T23:05:00.000Z");
      return { ok: true };
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(observedAccess, {
    secretRef: "vault://github/operator-readonly-installation-token",
    purpose: "github.readonly.organization.get",
    correlationId: "corr_wave5_001",
    tenantId: "uni.operator",
  });
  assert.equal(observedSignal instanceof AbortSignal, true);
  assert.equal(sourceBytes.toString("utf8"), token);
  assert.equal([...leasedBytes].every((value) => value === 0), true);
  assert.deepEqual(provider.descriptor, {
    mode: "resolver",
    maxSecretBytes: 8192,
    resolveTimeoutMs: 10000,
    directSecretAccepted: false,
    secretMaterialPersisted: false,
    productionChanged: false,
  });
  assert.equal(JSON.stringify(provider.descriptor).includes(token), false);
});

test("resolver provider integrates with the contract and supports a 520-byte stateless installation token", async () => {
  const token = token520();
  let consumerCalls = 0;

  const provider = createOperatorSecretResolverProvider({
    resolveSecret() {
      return {
        bytes: Buffer.from(token, "utf8"),
        version: "stateless-installation-v1",
      };
    },
  });

  const result = await withOperatorSecret({
    secretProvider: provider,
    access: {
      secretRef: "secret://github/operator-readonly-installation-token",
      purpose: "github.readonly.repository.list",
    },
    consumer: async (lease) => {
      consumerCalls += 1;
      assert.equal(lease.bytes.byteLength, 520);
      return {
        accepted: true,
        digestLength: lease.bytes.byteLength,
      };
    },
  });

  assert.deepEqual(result, { accepted: true, digestLength: 520 });
  assert.equal(consumerCalls, 1);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("resolver provider rejects malformed, oversized and expired leases", async () => {
  const cases = [
    {
      resolveSecret: () => ({ bytes: "not-bytes" }),
      code: "secret_resolver_contract_violation",
  },
    {
      resolveSecret: () => ({ bytes: new Uint8Array(8193) }),
      code: "secret_resolver_contract_violation",
  },
    {
      resolveSecret: () => ({
        bytes: Buffer.from("ghs_test", "utf8"),
        expiresAt: "2026-08-02T22:59:59.000Z",
      }),
      code: "secret_lease_expired",
    },
  ];

  for (const entry of cases) {
    const provider = createOperatorSecretResolverProvider({
      now: () => Date.parse("2026-08-02T23:00:00.000Z"),
      resolveSecret: entry.resolveSecret,
    });

    await assert.rejects(
      () =>
        provider.withSecret(
          {
            secretRef: "vault://github/operator-readonly-installation-token",
            purpose: "github.readonly.organization.get",
          },
          async () => ({ ok: true }),
        ),
      (error) =>
        error instanceof OperatorSecretResolverProviderError &&
        error.code === entry.code,
    );
  }
});

test("resolver failures and timeouts are sanitized", async () => {
  const token = token520();
  const failingProvider = createOperatorSecretResolverProvider({
    resolveSecret() {
      throw new Error(`backend failed with ${token}`);
    },
  });

  await assert.rejects(
    () =>
      failingProvider.withSecret(
        {
          secretRef: "vault://github/operator-readonly-installation-token",
          purpose: "github.readonly.organization.get",
        },
        async () => ({ ok: true }),
      ),
    (error) => {
      assert.equal(error instanceof OperatorSecretResolverProviderError, true);
      assert.equal(error.code, "secret_unavailable");
      assert.equal(error.message.includes(token), false);
      assert.equal(JSON.stringify(error.details).includes(token), false);
      return true;
    },
  );

  let observedSignal;
  const timeoutProvider = createOperatorSecretResolverProvider({
    resolveTimeoutMs: 5,
    resolveSecret(_access, context) {
      observedSignal = context.signal;
      return new Promise(() => {});
    },
  });

  await assert.rejects(
    () =>
      timeoutProvider.withSecret(
        {
          secretRef: "vault://github/operator-readonly-installation-token",
          purpose: "github.readonly.organization.get",
        },
        async () => ({ ok: true }),
      ),
    (error) =>
      error instanceof OperatorSecretResolverProviderError &&
      error.code === "secret_resolver_timeout",
  );
  assert.equal(observedSignal.aborted, true);
});

test("resolver provider validates configuration bounds", () => {
  assert.throws(
    () => createOperatorSecretResolverProvider({ resolveSecret: null }),
    /resolveSecret must be a function/,
  );
  assert.throws(
    () =>
      createOperatorSecretResolverProvider({
        resolveSecret() {},
        maxSecretBytes: 8193,
      }),
    /maxSecretBytes must be an integer/,
  );
  assert.throws(
    () =>
      createOperatorSecretResolverProvider({
        resolveSecret() {},
        resolveTimeoutMs: 60001,
      }),
    /resolveTimeoutMs must be an integer/,
   );
});
