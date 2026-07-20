import {createMemorySubscriptionRepository} from "./repository.mjs";
import {createServiceContext} from "./service-context.mjs";
import {createLifecycleOperations} from "./lifecycle-operations.mjs";
import {createPlanOperations} from "./plan-operations.mjs";

export function createSubscriptionService({
  repository=createMemorySubscriptionRepository(),
  idFactory,
  clock=()=>new Date().toISOString(),
  assertTenantOperational=()=>true,
}={}){
  const ctx=createServiceContext({repository,idFactory,clock,assertTenantOperational});
  return Object.freeze({
    repositoryKind:repository.kind??"custom",
    ...createLifecycleOperations(ctx),
    ...createPlanOperations(ctx),
    getCurrent:ctx.current,
    listHistory:id=>repository.listHistory(id),
    listCurrentByTenant:id=>repository.listCurrentByTenant(id),
  });
}
