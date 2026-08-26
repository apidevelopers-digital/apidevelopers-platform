import assert from "node:assert/strict";
import test from "node:test";

import { evaluateProductionReadinessReport } from "../scripts/enforce-production-readiness-report.mjs";

function report({ parentValid, productionValid, classification }) {
  return {
    schema: "api-gateway-production-observability/v1",
    classification,
    targets: {
      hostingerParent: { valid: parentValid },
      productionDomain: { valid: productionValid },
    },
  };
}

test("public production readiness is the critical gate while parent remains diagnostic by default", () => {
  const result = evaluateProductionReadinessReport(
    report({
      parentValid: false,
      productionValid: true,
      classification: "parent_hostname_regression_or_aliasing_anomaly",
    }),
  );

  assert.deepEqual(result, {
    productionValid: true,
    parentValid: false,
    parentRequired: false,
    healthy: true,
    classification: "parent_hostname_regression_or_aliasing_anomaly",
  });
});

test("production domain failure remains blocking even when parent is healthy", () => {
  const result = evaluateProductionReadinessReport(
    report({
      parentValid: true,
      productionValid: false,
      classification: "production_domain_routing_regression",
    }),
  );

  assert.equal(result.healthy, false);
  assert.equal(result.productionValid, false);
});

test("parent can be restored as a critical gate only through explicit policy", () => {
  const result = evaluateProductionReadinessReport(
    report({
      parentValid: false,
      productionValid: true,
      classification: "parent_hostname_regression_or_aliasing_anomaly",
    }),
    { requireParent: true },
  );

  assert.equal(result.parentRequired, true);
  assert.equal(result.healthy, false);
});
