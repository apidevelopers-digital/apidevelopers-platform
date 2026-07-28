import { assertAuditEventContract } from "@apidevelopers/contracts";
import { createGlobalTrustIntegrityService } from "./global-trust-integrity.mjs";

const COLLECTION = "global_trust_audit_events";

export function createDurableGlobalTrustAuditSink({
  store,
  integrity = createGlobalTrustIntegrityService({ store }),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction must be a function");
  }
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction must be a function");
  }

  return async function persistAuditEvent(event) {
    const validated = assertAuditEventContract(event, "auditEvent");
    const result = await store.transaction((tx) => {
      tx.put(COLLECTION, validated.eventId, validated, { ifAbsent: true });
      integrity.appendInTransaction(tx, {
        tenantId: validated.tenantId,
        sourceCollection: COLLECTION,
        recordId: validated.eventId,
        payload: validated,
      });
      return validated;
    });
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
