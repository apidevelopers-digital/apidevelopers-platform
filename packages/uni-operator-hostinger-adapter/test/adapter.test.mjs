import assert from "node:assert/strict";
import test from "node:test";

import {
  createPlannerHostingerInventory,
  createUniOperatorHostingerSnapshot,
} from "../src/index.mjs";

test("direct Hostinger responses are normalized without identifiers or personal data", () => {
  const snapshot = createUniOperatorHostingerSnapshot({
    domain: "APIdevelopers.digital.",
    capturedAt: "2026-07-29T21:40:00.000Z",
    websitesResponse: {
      data: [
        {
          domain: "apidevelopers.digital",
          vhost_type: "addon",
          is_enabled: true,
          username: "hosting-user-secret",
          client_id: 123,
          order_id: 456,
          root_directory: "/home/hosting-user-secret/domains/apidevelopers.digital/public_html",
        },
      ],
    },
    wordpressInstallationsResponse: [
      {
        id: "installation-secret",
        username: "hosting-user-secret",
        domain: "apidevelopers.digital",
        url: "http://apidevelopers.digital/",
        directory: "",
        language: "pt_BR",
        login: "admin-secret",
        email: "person@example.test",
        is_valid: true,
      },
    ],
  });

  assert.equal(snapshot.source, "uni.operator.hostinger.direct.v1");
  assert.equal(snapshot.mode, "read-only");
  assert.equal(snapshot.website.enabled, true);
  assert.equal(snapshot.website.documentRootKind, "public_html");
  assert.equal(snapshot.wordpress.valid, true);
  assert.equal(snapshot.wordpress.rootInstallation, true);
  assert.equal(snapshot.wordpress.baseUrl, "https://apidevelopers.digital");

  const serialized = JSON.stringify(snapshot);
  for (const forbidden of [
    "hosting-user-secret",
    "installation-secret",
    "admin-secret",
    "person@example.test",
    "/home/",
    "client_id",
    "order_id",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("planner inventory remains read-only and identifier-free", () => {
  const snapshot = createUniOperatorHostingerSnapshot({
    domain: "apidevelopers.digital",
    websitesResponse: [{ domain: "apidevelopers.digital", is_enabled: true }],
    wordpressInstallationsResponse: [
      {
        domain: "apidevelopers.digital",
        directory: "",
        language: "pt_BR",
        is_valid: true,
      },
    ],
  });

  const inventory = createPlannerHostingerInventory(snapshot);

  assert.equal(inventory.found, true);
  assert.equal(inventory.wordpressReady, true);
  assert.deepEqual(inventory.websites[0].domains, ["apidevelopers.digital"]);
  assert.equal(inventory.wordpressInstallations[0].path, "");
  assert.equal("id" in inventory.wordpressInstallations[0], false);
  assert.equal("username" in inventory.wordpressInstallations[0], false);
});
