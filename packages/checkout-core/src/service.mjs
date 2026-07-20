import { createMemoryCheckoutRepository } from "./repository.mjs";
import { createCheckoutContext } from "./service-context.mjs";
import { createSessionOperations } from "./session-operations.mjs";

export function createCheckoutService({
  repository = createMemoryCheckoutRepository(),
  idFactory,
  clock = () => new Date().toISOString(),
  assertAccountOperational = () => true,
} = {}) {
  const ctx = createCheckoutContext({
    repository,
    idFactory,
    clock,
    assertAccountOperational,
  });
  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",
    ...createSessionOperations(ctx),
    getCurrent: ctx.current,
    listHistory: (checkoutId) => repository.listHistory(checkoutId),
    listCurrentByAccount: (accountId) => repository.listCurrentByAccount(accountId),
  });
}
