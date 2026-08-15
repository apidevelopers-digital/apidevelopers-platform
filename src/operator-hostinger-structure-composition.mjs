import { createOperationalGateway } from "./operational-composition.mjs";
import {
  HostingerStructureInventoryError,
  createHostingerStructureInventoryService,
} from "./operator-hostinger-structure-inventory.mjs";
import {
  createHostingerStructureInventoryHttpApp,
} from "./operator-hostinger-structure-http.mjs";
import {
  HostingerDatabaseSchemaInventoryError,
} from "./operator-hostinger-database-schema-policy.mjs";
import {
  createHostingerDatabaseSchemaInventoryService,
} from "./operator-hostinger-database-schema-inventory.mjs";
import {
  createHostingerDatabaseSchemaInventoryHttpApp,
} from "./operator-hostinger-database-schema-http.mjs";

export function createUnavailableHostingerStructureInventoryAdapter() {
  return Object.freeze({
    async listMetadata() {
      throw new HostingerStructureInventoryError(
        "adapter_unavailable",
        "Hostinger structure inventory adapter is unavailable",
      );
    },
  });
}

export function createUnavailableHostingerDatabaseSchemaInventoryAdapter() {
  return Object.freeze({
    async inspectSchema() {
      throw new HostingerDatabaseSchemaInventoryError(
        "adapter_unavailable",
        "Hostinger database schema adapter is unavailable",
      );
    },
  });
}

export function createOperationalGatewayWithHostingerStructure({
  hostingerStructureInventoryAdapter,
  hostingerStructureInventoryNow,
  hostingerDatabaseSchemaInventoryAdapter,
  hostingerDatabaseSchemaInventoryNow,
  ...operationalOptions
} = {}) {
  const base = createOperationalGateway(operationalOptions);

  const structureAdapter =
    hostingerStructureInventoryAdapter ??
    createUnavailableHostingerStructureInventoryAdapter();
  const hostingerStructureInventory =
    createHostingerStructureInventoryService({
      inventoryAdapter: structureAdapter,
      ...(hostingerStructureInventoryNow
        ? { now: hostingerStructureInventoryNow }
        : {}),
    });

  const structureApp = createHostingerStructureInventoryHttpApp({
    app: base.app,
    authenticator: base.authenticator,
    authorization: base.authorization,
    inventory: hostingerStructureInventory,
    audit: base.audit,
  });

  const databaseSchemaAdapter =
    hostingerDatabaseSchemaInventoryAdapter ??
    createUnavailableHostingerDatabaseSchemaInventoryAdapter();
  const hostingerDatabaseSchemaInventory =
    createHostingerDatabaseSchemaInventoryService({
      schemaAdapter: databaseSchemaAdapter,
      ...(hostingerDatabaseSchemaInventoryNow
        ? { now: hostingerDatabaseSchemaInventoryNow }
        : {}),
    });

  const app = createHostingerDatabaseSchemaInventoryHttpApp({
    app: structureApp,
    authenticator: base.authenticator,
    authorization: base.authorization,
    inventory: hostingerDatabaseSchemaInventory,
    audit: base.audit,
  });

  return Object.freeze({
    ...base,
    hostingerStructureInventory,
    hostingerStructureInventoryAdapter: structureAdapter,
    hostingerDatabaseSchemaInventory,
    hostingerDatabaseSchemaInventoryAdapter: databaseSchemaAdapter,
    app,
  });
}
