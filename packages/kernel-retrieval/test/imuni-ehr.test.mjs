
import test from "node:test";
import assert from "node:assert/strict";

import { createImuniEhrConnector } from "../src/connectors/imuni-ehr.mjs";

test("imuni EHR adapter returns safe labels only", async () => {
  const calls = [];
  const connector = createImuniEhrConnector({
    searchMedicalRecords: async (request) => {
      calls.push(request);
      return {
        ok: true,
        readOnly: true,
        execution: false,
        records: [{
          id: "provider-record-42",
          recordType: "Exame laboratorial",
          createdAt: "2026-10-05T18:00:00Z",
          patientName: "Paciente Privado",
          body: "conteudo clinico privado",
          url: "https://ehr.invalid/private",
        }],
      };
    },
  });

  const [result] = await connector.search({
    query: "hemograma",
    limit: 10,
    requestedAt: "2026-10-05T21:00:00Z",
    medicalContext: {
      subjectId: "patient-opaque-42",
      purposeOfUse: "care-support",
    },
  });

  assert.deepEqual(calls, [{
    subjectId: "patient-opaque-42",
    purposeOfUse: "care-support",
    query: "hemograma",
    limit: 10,
  }]);

  assert.equal(result.safeLabel, "Exame laboratorial");
  assert.equal(result.title, "Exame laboratorial");
  assert.equal(result.snippet, "");
  assert.equal(result.uri, "");
  assert.equal(result.sensitivity, "restricted");
  assert.match(result.providerObjectId, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.evidenceDigest, /^sha256:[a-f0-9]{64}$/);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("Paciente Privado"), false);
  assert.equal(serialized.includes("conteudo clinico privado"), false);
  assert.equal(serialized.includes("ehr.invalid"), false);
  assert.equal(serialized.includes("provider-record-42"), false);
  assert.equal(serialized.includes("patient-opaque-42"), false);
});

test("imuni EHR adapter requires subject and purpose", async () => {
  const connector = createImuniEhrConnector({
    searchMedicalRecords: async () => ({
      ok: true,
      readOnly: true,
      execution: false,
      records: [],
    }),
  });

  await assert.rejects(
    connector.search({
      query: "x",
      medicalContext: { subjectId: "patient-opaque-42" },
    }),
    (error) => error.code === "INVALID_ARGUMENT",
  );
});

test("imuni EHR adapter rejects writable provider responses", async () => {
  const connector = createImuniEhrConnector({
    searchMedicalRecords: async () => ({
      ok: true,
      readOnly: false,
      execution: true,
      records: [],
    }),
  });

  await assert.rejects(
    connector.search({
      query: "x",
      medicalContext: {
        subjectId: "patient-opaque-42",
        purposeOfUse: "care-support",
      },
    }),
    (error) => error.code === "MEDICAL_READ_ONLY_VIOLATION",
  );
});
