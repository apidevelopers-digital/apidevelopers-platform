import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/saas-operational-http-composition.mjs", import.meta.url),
  "utf8",
);

test("operational composition wires explicit Zuni readiness probe into the provisioning guard", () => {
  assert.match(source, /probeZuniProductReadiness/);
  assert.match(source, /createZuniOperationalReadinessComposition/);
  assert.match(source, /saasRuntime:\s*saasComposition\.saasRuntime/);
  assert.match(source, /zuniProductProvisioner:\s*readinessProvisioner/);
});

test("operational composition stays fail-closed when no Zuni readiness probe is configured", () => {
  assert.match(
    source,
    /typeof probeZuniProductReadiness === "function"[\s\S]*?: undefined/,
  );
  assert.doesNotMatch(
    source,
    /probeZuniProductReadiness\s*\?\?\s*\(.*ready:\s*true/s,
  );
  assert.doesNotMatch(
    source,
    /productReady:\s*true[\s\S]*shared_saas_runtime/,
  );
});

test("explicit product provisioner remains an auditable override for controlled tests/composition", () => {
  assert.match(
    source,
    /zuniProductProvisioner\s*\?\?\s*\(typeof probeZuniProductReadiness/,
  );
});
