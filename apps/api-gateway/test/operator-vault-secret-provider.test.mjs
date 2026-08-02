import assert from "node:assert/strict";
import test from "node:test";

import {
  OperatorVaultSecretProviderError,
  createOperatorVaultSecretProvider,
} from "../src/operator-vault-secret-provider.mjs";
import {
  OperatorSecretContractError,
  withOperatorSecret,
} from "../src/operator-secret-provider-contract.mjs";

const NOW = "2026-08-01T23:50:00.000Z";
const REF = "vault://github/operator-readonly";

function fixedNow() {
  return new Date(NOW);
}

test("vault adapter provides a bounded temporary lease through the secret contract", async () => {
  const accesses = [];
  let consumerBytes;

  const secretProvider = createOperatorVaultSecretProvider({
    allowedSecretRefs: [REF],
    now: fixedNow,
    vaultClient: {
      async withSecretLease(access, consumer) {
        accesses.push(access);
        const raw = Buffer.from("fixture-only-token");
        try {
          return await consumer({
            bytes: raw,
            version: "fixture-v1",
            expiresAt: "2026-08-01T23:51:00.000Z",
          });
        } finally {
          raw.fill(0);
        }
      },
    },
  });

  const result = await withOperatorSecret({
    secretProvider,
    access: {
      secretRef: REF,
      purpose: "github.readonly.organization.get",
      correlationId: "corr_001",
      tenantId: "institution",
    },
    consumer: async (lease) => {
      consumerBytes = lease.bytes;
      return Object.freeze({
        byteLength: lease.bytes.byteLength,
        version: lease.version,
        expiresAt: lease.expiresAt,
      });
    },
  });

  assert.deepEqual(result, {
    byteLength: Buffer.byteLength("fixture-only-token"),
    version: "fixture-v1",
    expiresAt: "2026-08-01T23:51:00.000Z",
  });
  assert.equal(accesses.length, 1);
  assert.deepEqual(accesses[0], {
    secretRef: REF,
    purpose: "github.readonly.organization.get",
    correlationId: "corr_001",
    tenantId: "institution",
  });
  assert.ok(consumerBytes.every((value) => value === 0));
  assert.equal(JSON.stringify(result).includes("fixture-only-token"), false);
});

test("vault adapter denies references outside the exact allowlist before client access", async () => {
  let calls = 0;
  const provider = createOperatorVaultSecretProvider({
    allowedSecretRefs: [REF],
    vaultClient: {
      async withSecretLease() {
        calls += 1;
      },
    },
  });

  await assert.rejects(
    provider.withSecret(
      {
        secretRef: "vault://github/other",
        purpose: "github.readonly.test",
      },
      async () => ({}),
    ),
    (error) =>
      error instanceof OperatorVaultSecretProviderError &&
      error.code === "vault_reference_denied",
  );
  assert.equal(calls, 0);
});

test("vault adapter rejects expired, oversized and malformed leases", async () => {
  const cases = [
    { bytes: Buffer.from("expired"), expiresAt: "2026-08-01T23:49:59.000Z" },
    { bytes: Buffer.alloc(8193) },
    { bytes: "plain-string" },
  ];

  for (const lease of cases) {
    const provider = createOperatorVaultSecretProvider({
      allowedSecretRefs: [REF],
      now: fixedNow,
      vaultClient: {
        async withSecretLease(access, consumer) {
          return consumer(lease);
        },
      },
    });

    await assert.rejects(
      provider.withSecret(
        { secretRef: REF, purpose: "github.readonly.test" },
        async () => ({}),
      ),
      (error) =>
        error instanceof OperatorVaultSecretProviderError &&
        ["vault_lease_expired", "vault_contract_violation"].includes(error.code),
    );
  }
});

test("vault adapter sanitizes client failures and preserves consumer failures", async () => {
  const unavailable = createOperatorVaultSecretProvider({
    allowedSecretRefs: [REF],
    vaultClient: {
      async withSecretLease() {
        throw new Error("provider internal secret detail");
      },
    },
  });

  await assert.rejects(
    unavailable.withSecret(
      { secretRef: REF, purpose: "github.readonly.test" },
      async () => ({}),
    ),
    (error) =>
      error instanceof OperatorVaultSecretProviderError &&
      error.code === "vault_unavailable" &&
      !error.message.includes("internal secret detail"),
  );

  const consumerFailure = new Error("consumer failed");
  const provider = createOperatorVaultSecretProvider({
    allowedSecretRefs: [REF],
    vaultClient: {
      async withSecretLease(access, consumer) {
        return consumer({ bytes: Buffer.from("fixture") });
      },
    },
  });

  await assert.rejects(
    provider.withSecret(
      { secretRef: REF, purpose: "github.readonly.test" },
      async () => {
        throw consumerFailure;
      },
    ),
    (error) => error === consumerFailure,
  );
});

test("vault adapter enforces exactly one lease callback", async () => {
  for (const mode of ["none", "twice"]) {
    const provider = createOperatorVaultSecretProvider({
      allowedSecretRefs: [REF],
      vaultClient: {
        async withSecretLease(access, consumer) {
          if (mode === "none") return "not-consumed";
          await consumer({ bytes: Buffer.from("first") });
          return consumer({ bytes: Buffer.from("second") });
        },
      },
    });

    await assert.rejects(
      provider.withSecret(
        { secretRef: REF, purpose: "github.readonly.test" },
        async () => "ok",
      ),
      (error) =>
        error instanceof OperatorVaultSecretProviderError &&
        error.code === "vault_contract_violation",
    );
  }
});

test("vault adapter retains the canonical secret access validation", () => {
  assert.throws(
    () =>
      createOperatorVaultSecretProvider({
        allowedSecretRefs: ["env://GITHUB_TOKEN"],
        vaultClient: { async withSecretLease() {} },
      }),
    (error) =>
      error instanceof OperatorSecretContractError &&
      error.code === "invalid_secret_ref",
  );
});
