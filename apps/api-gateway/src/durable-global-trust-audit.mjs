import { assertAuditEventContract } from "@apidevelopers/contracts";

const COLLECTION = "global_trust_audit_events";

export function createDurableGlobalTrustAuditSink({ store } = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction must be a function");
  }

  return async function persistAuditEvent(event) {
    const validated = assertAuditEventContract(event, "auditEvent");
    const result = await store.transaction((tx) =>
      tx.put(COLLECTION, validated.eventId, validated, { ifAbsent: true }),
    );
    return result.result;
  };
}

export async function listDurableGlobalTrustAuditEvents(store) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction must be a function");
  }
  const result = await store.transaction((tx) => tx.list(COLLECTION));
  return result.result.map(({ value }) => value);
}
