import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createGlobalTrustComposedOperationalGateway,
} from "../src/operational-global-trust-composition.mjs";

function principal(tenantId, id, scopes) {
  return { id, tenantId, kind: "human", scopes };
}

test("composes Global Trust controls over one tenant-bound store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "global-trust-composition-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const gateway = createGlobalTrustComposedOperationalGateway({
      stateFilePath,
      adminKey: "operator-key",
      adminPrincipal: principal("tenant_001", "operator_001", [
        "admission:evaluate",
        "simulation:run",
        "audit:read",
        "incident:manage",
        "incident:read",
        "incident:write",
        "modelregistry:read",
        "modelregistry:write",
        "outputvalidator:evaluate",
        "promptdefense:evaluate",
        "toolinvocation:evaluate",
        "usecaseregistry:read",
        "usecaseregistry:write",
        "datapolicyregistry:read",
        "datapolicyregistry:write",
      ]),
    });

    for (const property of [
      "store",
      "authenticator",
      "authorization",
      "risk",
      "humanApproval",
      "killSwitch",
      "integrity",
      "toolInvocationGuard",
      "toolInvocationIntegrity",
      "modelRegistry",
      "modelRegistryIntegrity",
      "useCaseRegistry",
      "useCaseRegistryIntegrity",
      "dataPolicyRegistry",
      "dataPolicyRegistryIntegrity",
      "promptDefense",
      "promptDefenseIntegrity",
      "outputValidator",
      "outputValidatorIntegrity",
      "incidentQueue",
      "incidentIntegrity",
      "admissionGate",
      "admissionIntegrity",
      "safetySimulation",
      "safetySimulationIntegrity",
      "app",
    ]) {
      assert.ok(gateway[property], `${property} must be composed`);
    }

    assert.equal(Object.isFrozen(gateway), true);
    assert.equal(Object.isFrozen(gateway.composition), true);
    assert.equal(gateway.composition.contractVersion, "1.2");
    assert.equal(gateway.composition.sharedStore, true);
    assert.equal(gateway.composition.inferenceRouteEnabled, false);
    assert.equal(gateway.composition.modelExecutionEnabled, false);
    assert.equal(gateway.composition.toolExecutionEnabled, false);
    assert.equal(gateway.composition.providerContactEnabled, false);
    assert.equal(gateway.composition.deploymentExecuted, false);
    assert.equal(gateway.composition.automaticRemediationEnabled, false);
    assert.deepEqual(gateway.composition.capabilities, [
      "tenant-context",
      "authorization",
      "audit",
      "risk-engine",
      "human-approval",
      "kill-switch",
      "observability",
      "integrity",
      "tool-invocation-guard",
      "model-registry",
      "use-case-registry",
      "data-policy-registry",
      "prompt-defense",
      "output-validator",
      "incident-queue",
      "admission-gate",
      "safety-simulation",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
