
import test from "node:test";
import assert from "node:assert/strict";

import { createGovernedContentGate } from "../src/content-gate.mjs";

function makeApproval({
  tenantId = "tenant-a",
  sourceId = "mail-primary",
  objectId = "uid:42",
  purposeOfUse = "case-review",
  now = "2026-10-05T22:00:00.000Z",
} = {}) {
  const objectDigest = cryptoDigest(`${sourceId}:${objectId}`);
  return {
    approvalId: "apr-001",
    approvedBy: "human-reviewer",
    approvedAt: "2026-10-05T21:55:00.000Z",
    expiresAt: "2026-10-05T22:30:00.000Z",
    tenantId,
    sourceId,
    objectDigest,
    purposeOfUse,
  };
}

function cryptoDigest(value) {
  return (awaitImportCrypto.createHash("sha256").update(String(value)).digest("hex"));
}

import * as awaitImportCrypto from "node:crypto";

function makeGate(overrides = {}) {
  const audits = [];
  const gate = createGovernedContentGate({
    tenantId: "tenant-a",
    clock: () => "2026-10-05T22:00:00.000Z",
    authorize: async () => ({
      authorizationId: "authz-001",
      allow: true,
    }),
    evaluatePolicy: async () => ({
      decisionId: "policy-001",
      effect: "allow",
      riskLevel: "R4",
    }),
    audit: async (event) => {
      audits.push(event);
      return { ok: true };
    },
    redact: async ({ text, domain }) => ({
      text: domain === "medical" ? text.replaceAll("SECRET", "[REDACTED]") : text,
      applied: domain === "medical",
      redactions: domain === "medical" ? 1 : 0,
    }),
    ...overrides,
  });
  return { gate, audits };
}

test("R5 requires human approval before resolver execution", async () => {
  let resolverCalls = 0;
  const { gate, audits } = makeGate();
  gate.register({
    id: "mail-primary",
    async fetch() {
      resolverCalls += 1;
      return { text: "body" };
    },
  });

  await assert.rejects(
    gate.fetch({
      tenantId: "tenant-a",
      domain: "corporate",
      sourceId: "mail-primary",
      objectId: "uid:42",
      purposeOfUse: "case-review",
      actor: { principal: "operator", role: "curator" },
    }),
    (error) => error.code === "R5_APPROVAL_REQUIRED",
  );

  assert.equal(resolverCalls, 0);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].event, "retrieval.content.denied");
  assert.equal("objectId" in audits[0], false);
});

test("R5 binds approval to exact source, object, tenant and purpose", async () => {
  const { gate } = makeGate();
  gate.register({
    id: "mail-primary",
    async fetch() {
      return { text: "body" };
    },
  });

  const approval = makeApproval();
  approval.objectDigest = cryptoDigest("mail-primary:uid:999");

  await assert.rejects(
    gate.fetch({
      tenantId: "tenant-a",
      domain: "corporate",
      sourceId: "mail-primary",
      objectId: "uid:42",
      purposeOfUse: "case-review",
      actor: { principal: "operator", role: "curator" },
      approval,
    }),
    (error) => error.code === "R5_APPROVAL_SCOPE_MISMATCH",
  );
});

test("R5 returns redacted sensitive text and attachment metadata only", async () => {
  const { gate, audits } = makeGate();
  gate.register({
    id: "ehr",
    async fetch() {
      return {
        text: "clinical SECRET narrative",
        contentType: "text/plain",
        attachments: [
          {
            name: "lab.pdf",
            mimeType: "application/pdf",
            size: 1234,
            bytes: "MUST_NOT_ESCAPE",
            text: "MUST_NOT_ESCAPE",
            providerObjectId: "raw-attachment-id",
          },
        ],
      };
    },
  });

  const approval = makeApproval({
    sourceId: "ehr",
    objectId: "record:42",
    purposeOfUse: "care-support",
  });

  const result = await gate.fetch({
    tenantId: "tenant-a",
    domain: "medical",
    sourceId: "ehr",
    objectId: "record:42",
    purposeOfUse: "care-support",
    actor: { principal: "clinician", role: "doctor" },
    approval,
  });

  assert.equal(result.text, "clinical [REDACTED] narrative");
  assert.equal(result.redaction.applied, true);
  assert.equal(result.redaction.redactions, 1);
  assert.equal(result.attachments.length, 1);
  assert.deepEqual(Object.keys(result.attachments[0]).sort(), ["digest", "mimeType", "name", "size"]);
  assert.equal(JSON.stringify(result).includes("MUST_NOT_ESCAPE"), false);
  assert.equal(JSON.stringify(result).includes("raw-attachment-id"), false);
  assert.match(result.provenance.contentDigest, /^sha256:[a-f0-9]{64}$/);

  const returned = audits.find((event) => event.event === "retrieval.content.returned");
  assert.ok(returned);
  assert.equal("text" in returned, false);
  assert.equal(returned.attachmentCount, 1);
});

test("R5 fails closed when policy denies", async () => {
  let resolverCalls = 0;
  const { gate, audits } = makeGate({
    evaluatePolicy: async () => ({
      decisionId: "policy-deny",
      effect: "deny",
      riskLevel: "R4",
    }),
  });
  gate.register({
    id: "drive",
    async fetch() {
      resolverCalls += 1;
      return { text: "secret document" };
    },
  });

  await assert.rejects(
    gate.fetch({
      tenantId: "tenant-a",
      domain: "legal",
      sourceId: "drive",
      objectId: "file:1",
      purposeOfUse: "case-review",
      actor: { principal: "lawyer", role: "operator" },
      approval: makeApproval({
        sourceId: "drive",
        objectId: "file:1",
        purposeOfUse: "case-review",
      }),
    }),
    (error) => error.code === "R5_POLICY_DENIED",
  );

  assert.equal(resolverCalls, 0);
  assert.equal(audits.at(-1).event, "retrieval.content.denied");
});

test("R5 fails closed when audit append fails", async () => {
  let resolverCalls = 0;
  const { gate } = makeGate({
    audit: async () => {
      throw new Error("audit unavailable");
    },
  });
  gate.register({
    id: "mail-primary",
    async fetch() {
      resolverCalls += 1;
      return { text: "body" };
    },
  });

  await assert.rejects(
    gate.fetch({
      tenantId: "tenant-a",
      domain: "corporate",
      sourceId: "mail-primary",
      objectId: "uid:42",
      purposeOfUse: "case-review",
      actor: { principal: "operator", role: "curator" },
      approval: makeApproval(),
    }),
    (error) => error.code === "R5_AUDIT_FAILED",
  );

  assert.equal(resolverCalls, 0);
});

test("R5 rejects oversized full text after governed provider fetch", async () => {
  const { gate } = makeGate({ maxTextBytes: 8 });
  gate.register({
    id: "mail-primary",
    async fetch() {
      return { text: "123456789" };
    },
  });

  await assert.rejects(
    gate.fetch({
      tenantId: "tenant-a",
      domain: "corporate",
      sourceId: "mail-primary",
      objectId: "uid:42",
      purposeOfUse: "case-review",
      actor: { principal: "operator", role: "curator" },
      approval: makeApproval(),
    }),
    (error) => error.code === "R5_CONTENT_TOO_LARGE",
  );
});
