import {
  createMemoryActivationRepository,
} from "./repository.mjs";
import { createActivationContext } from "./service-context.mjs";
import { createRequestOperations } from "./request-operations.mjs";
import { createProgressOperations } from "./progress-operations.mjs";
import { createRecoveryOperations } from "./recovery-operations.mjs";

export function createActivationService({
  repository = createMemoryActivationRepository(),
  idFactory,
  clock = () => new Date().toISOString(),
} = {}) {
  const ctx = createActivationContext({
    repository,
    idFactory,
    clock,
  });

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",
    ...createRequestOperations(ctx),
    ...createProgressOperations(ctx),
    ...createRecoveryOperations(ctx),
    getCurrent: ctx.current,
    listHistory: (activationId) => repository.listHistory(activationId),
    getCurrentByCheckout: (checkoutId) =>
      repository.getCurrentByCheckout(checkoutId),
    listCurrentByAccount: (accountId) =>
      repository.listCurrentByAccount(accountId),
  });
}
