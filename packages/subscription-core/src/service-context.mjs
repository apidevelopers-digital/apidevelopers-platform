import {SubscriptionDomainError,createSubscriptionSnapshot,deepFreeze,isTerminalSubscription,requireIso,requireText} from "./model.mjs";

export const identifyPlan=(product,plan)=>{
  if(product?.status!=="READY_TO_SELL") throw new SubscriptionDomainError("product_not_sellable","product must be READY_TO_SELL");
  if(plan?.status!=="ACTIVE") throw new SubscriptionDomainError("plan_not_active","plan must be ACTIVE");
  if(plan.productId!==product.id) throw new SubscriptionDomainError("plan_product_mismatch","plan does not belong to product");
  if(!product.planIds?.includes(plan.id)) throw new SubscriptionDomainError("plan_not_declared_by_product","product does not declare plan");
  return {productId:requireText(product.id,"product.id"),productVersion:product.version,planId:requireText(plan.id,"plan.id"),planVersion:plan.version};
};

const makeEvent=(type,s,at,data={})=>deepFreeze({type,subscriptionId:s.subscriptionId,snapshotId:s.snapshotId,tenantId:s.tenantId,occurredAt:at,data});

export function createServiceContext({repository,idFactory,clock,assertTenantOperational}){
  if(typeof idFactory!=="function") throw new SubscriptionDomainError("invalid_argument","idFactory must be a function");
  const now=()=>requireIso(clock(),"clock");
  const current=id=>{const s=repository.getCurrent(id);if(!s)throw new SubscriptionDomainError("subscription_not_found","subscription was not found",{subscriptionId:id});return s};
  const duplicate=sourceEventId=>{const s=repository.getBySourceEventId(sourceEventId);return s?deepFreeze({snapshot:s,appended:false,duplicateOf:s.snapshotId,events:[]}):null};
  const mutable=s=>{if(isTerminalSubscription(s))throw new SubscriptionDomainError("terminal_subscription","terminal subscription cannot transition",{status:s.status})};
  const append=({previous=null,subscriptionId,tenantId,sourceEventId,type,data={},patch={}})=>{
    const at=now();
    const snapshot=createSubscriptionSnapshot({
      ...(previous??{}),...patch,
      snapshotId:requireText(idFactory(),"idFactory result"),
      subscriptionId:subscriptionId??previous?.subscriptionId,
      tenantId:tenantId??previous?.tenantId,
      revision:(previous?.revision??0)+1,
      previousSnapshotId:previous?.snapshotId??null,
      sourceEventId,createdAt:at,
    });
    const stored=repository.append(snapshot);
    return deepFreeze({...stored,events:stored.appended?[makeEvent(type,stored.snapshot,at,data)]:[]});
  };
  return Object.freeze({repository,assertTenantOperational,now,current,duplicate,mutable,append});
}
