import test from "node:test";
import assert from "node:assert/strict";

import { resolveZuniDelegatedBindingSigner } from "../src/saas-delegated-binding-runtime-config.mjs";

test("configured delegated binding fails closed without a secret provider", async () => {
  await assert.rejects(
    () =>
      resolveZuniDelegatedBindingSigner({
        env: {
          ZUNI_DELEGATED_BINDING_PRIVATE_KEY_REF: "vault://zuni/binding",
          ZUNI_DELEGATED_BINDING_KEY_ID: "zuni-binding-2026-08",
        },
      }),
    /secret provider is required/i,
  );
});

test("unconfigured delegated binding does not require a secret provider", async () => {
  const result = await resolveZuniDelegatedBindingSigner({ env: {} });
  assert.equal(result.configured, false);
  assert.equal(result.signer, null);
  assert.equal(result.descriptor.mode, "deny-by-default");
});
