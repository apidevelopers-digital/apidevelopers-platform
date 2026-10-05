import test from "node:test";
import assert from "node:assert/strict";

import {
  createFederatedRetrieval,
} from "../src/index.mjs";

function makeConnector({
  id,
  type,
  domains,
  resultFactory,
}) {
  return {
    id,
    type,
    domains,
    async search(request) {
      return resultFactory(request);
    },
  };
}

test("retrieval keeps tenant isolation and source provenance", async () => {
  const email = makeConnector({
    id: "mail-primary",
    type: "email",
    domains: ["corporate"],
    resultFactory: (request) => [{
      id: "msg-1",
      domain: "corporate",
      title: `Resultado: ${request.query}`,
      snippet: "Cabeçalho e trecho seguro",
      providerObjectId: "provider-msg-1",
      evidenceDigest: "sha256:abc",
    }],
  });

  const retrieval = createFederatedRetrieval({
    tenantId: "tenant-a",
    connectors: [email],
    clock: () => "2026-10-05T18:00:00.000Z",
  });

  const response = await retrieval.search({
    tenantId: "tenant-a",
    query: "ficha catalográfica",
    domains: ["corporate"],
  });

  assert.equal(response.tenantId, "tenant-a");
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].source.connectorId, "mail-primary");
  assert.equal(response.results[0].source.sourceType, "email");
  assert.equal(response.results[0].provenance.providerObjectId, "provider-msg-1");
  assert.equal(response.results[0].provenance.evidenceDigest, "sha256:abc");
});

test("cross-tenant retrieval is blocked", async () => {
  const retrieval = createFederatedRetrieval({
    tenantId: "tenant-a",
  });

  await assert.rejects(
    retrieval.search({
      tenantId: "tenant-b",
      query: "x",
      domains: ["corporate"],
    }),
    (error) => error.code === "TENANT_MISMATCH",
  );
});

test("medical retrieval requires explicit subject and purpose", async () => {
  const retrieval = createFederatedRetrieval({
    tenantId: "tenant-a",
  });

  await assert.rejects(
    retrieval.search({
      tenantId: "tenant-a",
      query: "últimos exames",
      domains: ["medical"],
    }),
    (error) => error.code === "MEDICAL_CONTEXT_REQUIRED",
  );
});

test("medical results are minimized at the generic federation layer", async () => {
  const medical = makeConnector({
    id: "ehr-readonly",
    type: "medical_record",
    domains: ["medical"],
    resultFactory: (request) => [{
      id: "record-opaque-1",
      domain: "medical",
      title: "Nome sensível que não deve vazar",
      safeLabel: "Exame laboratorial",
      snippet: "conteúdo clínico sensível",
      uri: "provider://record/opaque-1",
      providerObjectId: "opaque-1",
      occurredAt: "2026-10-01",
      requestPurpose: request.medicalContext.purposeOfUse,
    }],
  });

  const retrieval = createFederatedRetrieval({
    tenantId: "tenant-a",
    connectors: [medical],
  });

  const response = await retrieval.search({
    tenantId: "tenant-a",
    query: "hemograma",
    domains: ["medical"],
    medicalContext: {
      subjectId: "patient-opaque-42",
      purposeOfUse: "care-support",
    },
  });

  assert.equal(response.medicalScopeApplied, true);
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].title, "Exame laboratorial");
  assert.equal(response.results[0].snippet, "");
  assert.equal(response.results[0].uri, "");
  assert.equal(response.results[0].sensitivity, "restricted");
  assert.equal("medicalContext" in response, false);
});

test("full-content retrieval is refused in v0.1", async () => {
  const retrieval = createFederatedRetrieval({
    tenantId: "tenant-a",
  });

  await assert.rejects(
    retrieval.search({
      tenantId: "tenant-a",
      query: "documento",
      domains: ["institutional"],
      includeContent: true,
    }),
    (error) => error.code === "CONTENT_RETRIEVAL_NOT_SUPPORTED",
  );
});

test("source filtering limits provider fan-out", async () => {
  let emailCalls = 0;
  let fileCalls = 0;

  const retrieval = createFederatedRetrieval({
    tenantId: "tenant-a",
    connectors: [
      makeConnector({
        id: "mail",
        type: "email",
        domains: ["corporate"],
        resultFactory: () => {
          emailCalls += 1;
          return [{ id: "m1", domain: "corporate", title: "mail" }];
        },
      }),
      makeConnector({
        id: "drive",
        type: "file",
        domains: ["corporate"],
        resultFactory: () => {
          fileCalls += 1;
          return [{ id: "f1", domain: "corporate", title: "file" }];
        },
      }),
    ],
  });

  const response = await retrieval.search({
    tenantId: "tenant-a",
    query: "contrato",
    domains: ["corporate"],
    sourceIds: ["mail"],
  });

  assert.equal(response.results.length, 1);
  assert.equal(emailCalls, 1);
  assert.equal(fileCalls, 0);
});

console.log("KERNEL_RETRIEVAL_GATE_OK");
