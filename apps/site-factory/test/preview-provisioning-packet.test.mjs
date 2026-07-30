import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewProvisioningPacket } from "../src/preview-provisioning-packet.mjs";

const request = {
  schemaVersion: "1.0",
  kind: "preview-web-app-provisioning-request",
  mode: "supervised-request",
  executable: false,
  approvalRequired: true,
  approvalScope: "create-isolated-preview-web-app-only",
  application: {
    name: "apidevelopers-institutional-preview",
    runtime: "react-vite",
    buildCommand: "npm run build",
    outputDirectory: "dist",
  },
  source: {
    repository: "apidevelopers-digital/apidevelopers-platform",
    sha: "abc123",
    artifactName: "site-factory-preview-provisioning-abc123",
  },
  target: {
    environment: "preview",
    domain: "preview-apidevelopers.apidevelopers.digital",
    healthcheck: "/",
    hosting: {
      provider: "hostinger",
      orderId: "order-***0581",
      username: "u***1810",
      plan: "hostinger_business_v3",
      inventoryCapturedAt: "2026-07-30T22:23:00.000Z",
      websitesInspected: 4,
    },
  },
  evidence: {
    promotionFingerprint: "promotion-fingerprint",
    readinessFingerprint: "readiness-fingerprint",
    blocker: "preview_web_app_not_found",
  },
  invariants: {
    preservePrimaryDomain: true,
    preserveCurrentWordPress: true,
    overwriteDns: false,
    wildcardDns: false,
    deployOnCreation: false,
    productionWrites: false,
  },
  requestedAction: {
    action: "create_preview_web_app",
    sensitive: true,
    approvalRequired: true,
    executable: false,
    createsHostingResource: true,
    connectsRepository: false,
    configuresDns: false,
    deploysArtifact: false,
  },
  deferredActions: [
    "connect_exact_source_commit",
    "configure_preview_domain",
    "deploy_preview_artifact",
  ],
  fingerprint: "request-fingerprint",
  approvalToken: "IGOR_APROVA_CRIACAO_WEBAPP_PREVIEW_ABC123ABC123",
};

const workflow = {
  name: "Site Factory Preview Provisioning Packet",
  runId: "12345",
  runAttempt: 1,
  repository: "apidevelopers-digital/apidevelopers-platform",
  ref: "refs/heads/feature",
};

test("creates an immutable evidence-only packet", () => {
  const packet = createPreviewProvisioningPacket({
    provisioningRequest: request,
    workflow,
    generatedAt: "2026-07-30T22:30:00.000Z",
  });

  assert.equal(packet.mode, "evidence-only");
  assert.equal(packet.executable, false);
  assert.equal(packet.requestedAction.executable, false);
  assert.equal(packet.invariants.packetDoesNotConfigureDns, true);
  assert.equal(packet.invariants.packetDoesNotDeployArtifact, true);
  assert.equal(packet.approvalToken, request.approvalToken);
  assert.match(packet.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(packet));
  assert.ok(Object.isFrozen(packet.workflow.runner));
});

test("is deterministic for the same evidence", () => {
  const input = {
    provisioningRequest: request,
    workflow,
    generatedAt: "2026-07-30T22:30:00.000Z",
  };
  assert.equal(
    createPreviewProvisioningPacket(input).fingerprint,
    createPreviewProvisioningPacket(input).fingerprint,
  );
});

test("rejects executable requests", () => {
  assert.throws(
    () =>
      createPreviewProvisioningPacket({
        provisioningRequest: { ...request, executable: true },
        workflow,
      }),
    /provisioning_request_must_remain_blocked/,
  );
});

test("rejects action scope expansion", () => {
  assert.throws(
    () =>
      createPreviewProvisioningPacket({
        provisioningRequest: {
          ...request,
          requestedAction: {
            ...request.requestedAction,
            configuresDns: true,
          },
        },
        workflow,
      }),
    /provisioning_action_scope_violation/,
  );
});

test("rejects invariant violations", () => {
  assert.throws(
    () =>
      createPreviewProvisioningPacket({
        provisioningRequest: {
          ...request,
          invariants: {
            ...request.invariants,
            preserveCurrentWordPress: false,
          },
        },
        workflow,
      }),
    /provisioning_invariants_violation/,
  );
});
