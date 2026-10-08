import { createInMemoryFamilyDataCore } from "./in-memory-store.mjs";

export {
  FAMILY_DATA_SCHEMA_VERSION,
  FAMILY_DATA_TENANT,
  createFamilyDataEnvelope
} from "./contract.mjs";

export { createInMemoryFamilyDataCore };
export { buildFamilyDataCoreSchemaSql } from "./postgres-schema.mjs";
export { createPostgresFamilyDataReadStore } from "./postgres-read-store.mjs";
export { createFamilyDataMcpReadTools, assertFamilyDataMcpReadOnly } from "./mcp-read-tools.mjs";
export { createFamilyDataHttpReadHandler } from "./http-read-handler.mjs";
export { createPostgresFamilyDataHttpReadBoundary } from "./postgres-http-read-boundary.mjs";

export const familyDataCapabilities = Object.freeze({
  read: [
    "family.purchase.list",
    "family.purchase.get",
    "family.product.stats",
    "family.product.price_history",
    "family.context.chef",
    "family.evidence.get"
  ],
  write: []
});
