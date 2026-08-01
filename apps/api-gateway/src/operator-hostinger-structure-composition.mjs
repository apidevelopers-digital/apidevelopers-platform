import { createOperationalGateway } from "./operational-composition.mjs";
import {
  HostingerStructureInventoryError,
  createHostingerStructureInventoryService,
} from "./operator-hostinger-structure-inventory.mjs";
import {
  createHostingerStructureInventoryHttpApp,
} from "./operator-hostinger-structure-http.mjs";

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

export function createOperationalGatewayWithHostingerStructure({
  hostingerStructureInventoryAdapter,
  hostingerStructureInventoryNow,
  ...operationalOptions
} = {}) {
  const base = createOperationalGateway(operationalOptions);
  const adapter =
    hostingerStructureInventoryAdapter ??
    createUnavailableHostingerStructureInventoryAdapter();
  const hostingerStructureInventory =
    createHostingerStructureInventoryService({
      inventoryAdapter: adapter,
      ...(hostingerStructureInventoryNow
        ? { now: hostingerStructureInventoryNow }
        : {}),
    });
  const app = createHostingerStructureInventoryHttpApp({
    app: base.app,
    authenticator: base.authenticator,
    authorization: base.authorization,
    inventory: hostingerStructureInventory,
    audit: base.audit,
  });

  return Object.freeze({
    ...base,
    hostingerStructureInventory,
    hostingerStructureInventoryAdapter: adapter,
    app,
  });
}
