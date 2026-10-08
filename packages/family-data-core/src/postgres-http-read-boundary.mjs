import { createFamilyDataHttpReadHandler } from "./http-read-handler.mjs";
import { createPostgresFamilyDataReadStore } from "./postgres-read-store.mjs";

export function createPostgresFamilyDataHttpReadBoundary({
  db,
  householdId,
  schema = "family_data",
  tenantId = "homosapiens-id",
  generatedAt,
  authorize,
  requestId
} = {}) {
  if (typeof authorize !== "function") {
    throw new TypeError("authorize callback is required");
  }

  const store = createPostgresFamilyDataReadStore({
    db,
    schema,
    householdId,
    generatedAt
  });

  return createFamilyDataHttpReadHandler({
    store,
    tenantId,
    authorize,
    requestId
  });
}
