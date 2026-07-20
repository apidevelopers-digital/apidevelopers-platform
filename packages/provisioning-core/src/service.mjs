import { createMemoryProvisioningRepository } from "./repository.mjs";
import { createProvisioningContext } from "./service-context.mjs";
import { createRequestOperations } from "./request-operations.mjs";
import { createResourceOperations } from "./resource-operations.mjs";
import { createRecoveryOperations } from "./recovery-operations.mjs";

export function createProvisioningService({
  repository = createMemoryProvisioningRepository(),
  idFactory,
  actionIdFactory,
  clock = () => new Date().toISOString(),
} = {}) {
  const ctx = createProvisioningContext({
    repository,
    idFactory,
    actionIdFactory,
    clock,
  });

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",
    ...createRequestOperations(ctx),
    ...createResourceOperations(ctx),
    ...createRecoveryOperations(ctx),
    getCurrent: ctx.current,
    listHistory: (provisioningId) =>
      repository.listHistory(provisioningId),
    getCurrentBySubscription: (subscriptionId) =>
      repository.getCurrentBySubscription(subscriptionId),
    listCurrentByAccount: (accountId) =>
      repository.listCurrentByAccount(accountId),
  });
}
