import {
  createMemoryOnboardingRepository,
} from "./repository.mjs";
import { createOnboardingContext } from "./service-context.mjs";
import { createRequestOperations } from "./request-operations.mjs";
import { createProgressOperations } from "./progress-operations.mjs";
import { createRecoveryOperations } from "./recovery-operations.mjs";

export function createOnboardingService({
  repository = createMemoryOnboardingRepository(),
  idFactory,
  clock = () => new Date().toISOString(),
} = {}) {
  const ctx = createOnboardingContext({
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
    listHistory: (onboardingId) =>
      repository.listHistory(onboardingId),
    getCurrentByActivation: (activationId) =>
      repository.getCurrentByActivation(activationId),
    listCurrentByAccount: (accountId) =>
      repository.listCurrentByAccount(accountId),
  });
}
