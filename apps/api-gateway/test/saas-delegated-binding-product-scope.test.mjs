import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import {
  createZuniDelegatedBindingSigner,
} from "../src/saas-delegated-binding-proof.mjs";

test("Zuni delegated binding signer refuses non-Zuni products without emitting a proof", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const signer = createZuniDelegatedBindingSigner({
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    keyId: "zuni-binding-test",
    clock: () => new Date("2026-08-24T17:00:00.000Z"),
    nonceFactory: () => "nonce-not-used",
  });

  const proof = signer.signBinding({
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.juri-main",
    accessGrantId: "component.access.acme.main.juri.user",
    productId: "uni-juri",
    principalId: "component.principal.user",
  });

  assert.equal(proof, null);
});
