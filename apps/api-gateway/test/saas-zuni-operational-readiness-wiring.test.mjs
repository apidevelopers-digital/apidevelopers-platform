import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/saas-operational-http-composition.mjs", import.meta.url),
  "utf8",
);

test("operational composition wires the concrete public Zuni readiness probe into the provisioning guard", () => {
  assert.match(source, /createZuniPublicReadinessProbe/);
  assert.match(source, /zuniReadinessFetch/);
  assert.match(source, /const concreteProbe = resolveZuniReadinessProbe/);
  assert.match(source, /probeZuniProductReadiness:\s*concreteProbe/);
  assert.match(source, /zuniProductProvisioner:\s*readinessProvisioner/);
});

test("explicit product probe remains the highest-priority auditable override", () => {
  assert.match(
    source,
    /typeof probeZuniProductReadiness === "function"[\s\S]*return probeZuniProductReadiness/,
  );
  assert.match(
    source,
    /zuniProductProvisioner\s*\?\?[\s\S]*createZuniOperationalReadinessComposition/,
  );
});

test("operational composition remains fail-closed if no fetch implementation is available", () => {
  assert.match(
    source,
    /typeof fetchFn !== "function"[\s\S]*return undefined/,
  );
  assert.doesNotMatch(
    source,
    /productReady:\s*true[\s\S]*shared_saas_runtime/,
  );
  assert.doesNotMatch(
    source,
    /ready:\s*true[\s\S]*without.*probe/is,
  );
});

test("default Zuni readiness URL is not accepted from runtime request input", () => {
  assert.doesNotMatch(source, /request\.(url|endpoint|readinessUrl)/);
  assert.doesNotMatch(source, /process\.env\.[A-Z_]*ZUNI[A-Z_]*URL/);
});
