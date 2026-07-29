import assert from "node:assert/strict";
import test from "node:test";

import { createUniOperatorHostingerSnapshot } from "@apidevelopers/uni-operator-hostinger-adapter";

import { createUniOperatorSiteFactoryDryRun } from "../src/uni-operator-bridge.mjs";

const manifest = {
  site: {
    id: "apidevelopers-institution",
    domain: "apidevelopers.digital",
    engine: "wordpress",
    locale: "pt-BR",
    maintenance: true,
  },
};

test("uni. Operador bridge uses the direct Hostinger connector without GitHub secrets", () => {
  const hostingerSnapshot = createUniOperatorHostingerSnapshot({
    domain: "apidevelopers.digital",
    capturedAt: "2026-07-29T21:40:00.000Z",
    websitesResponse: {
      data: [
        {
          domain: "apidevelopers.digital",
          is_enabled: true,
          username: "must-not-leak",
          client_id: 123,
        },
      ],
    },
    wordpressInstallationsResponse: [
      {
        id: "must-not-leak",
        username: "must-not-leak",
        domain: "apidevelopers.digital",
        directory: "",
        language: "pt_BR",
        email: "must-not-leak@example.test",
        is_valid: true,
      },
    ],
  });

  const report = createUniOperatorSiteFactoryDryRun({
    manifest,
    hostingerSnapshot,
    wordpressDiscovery: {
      hasWpV2: true,
      hasPagesRoute: true,
    },
    generatedAt: "2026-07-29T21:41:00.000Z",
  });

  assert.equal(report.execution.controlPlane, "uni.operator");
  assert.equal(report.execution.hostingerConnector, "direct");
  assert.equal(report.execution.githubSecretRequired, false);
  assert.equal(report.safety.writesEnabled, false);
  assert.equal(report.readyForApply, false);
  assert.ok(
    report.blockers.includes("wordpress_authentication_not_validated"),
  );

  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "must-not-leak",
    "must-not-leak@example.test",
    "client_id",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
