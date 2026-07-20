
import {SubscriptionDomainError,createSubscriptionSnapshot,deepFreeze,isTerminalSubscription,requireIso,requireText} from "./model.mjs";
import {createMemorySubscriptionRepository} from "./repository.mjs";

const ident=(product,plan)=>{
  if(product?.status!=="READY_TO_SELL") throw new SubscriptionDomainError("product_not_sellable","product must be READY_TO_SELL");
  if(plan?.status!=="ACTIVE") throw new SubscriptionDomainError("plan_not_active","plan must be ACTIVE");
  if(plan.productId!==product.id) throw new SubscriptionDomainError("plan_product_mismatch","plan does not belong to product");
  if(!product.planIds?.includes(plan.id)) throw new SubscriptionDomainError("plan_not_declared_by_product","product does not declare plan");
  return {productId:requireText(product.id,"product.id"),productVersion:product.version,planId:requireText(plan.id,"plan.id"),planVersion:plan.version};
};
const makeEvent=(type,s,at,data={})=>deepFreeze({type,subscriptionId:s.subscriptionId,snapshotId:s.snapshotId,tenantId:s.tenantId,occurredAt:at,data});

export function createSubscriptionService({repository=createMemorySubscriptionRepository(),idFactory,clock=()=>new Date().toISOString(),assertTenantOperational=()=>true}={}){
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
  return Object.freeze({
    repositoryKind:repository.kind??"custom",
    createPending({subscriptionId,tenantId,product,plan|sourceEventId,currentPeriodStart,currentPeriodEnd,billingAnchor=currentPeriodStart,billingInterval="month",metadata={}}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const tid=requireText(tenantId,"tenantId"); assertTenantOperational(tid);
      if(repository.getCurrent(subscriptionId))throw new SubscriptionDomainError("subscription_already_exists","subscription already exists");
      const i=ident(product,plan);
      return append({subscriptionId:requireText(subscriptionId,"subscriptionId"),tenantId:tid,sourceEventId,type:"subscription.created",data:i,patch:{...i,status:"pending",billingInterval,billingAnchor,currentPeriodStart,currentPeriodEnd,startedAt:null,endedAt:null,cancelAtPeriodEnd:false,pendingChange:null,metadata}});
    },
    activate({subscriptionId,sourceEventId,activatedAt=now(),currentPeriodStart,currentPeriodEnd}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId);
      if(prev.status!=="pending")throw new SubscriptionDomainError("invalid_subscription_transition","only pending subscriptions can activate",{status:prev.status});
      return append({previous:prev,sourceEventId,type:"subscription.activated",data:{productId:prev.productId,planId:prev.planId},patch:{status:"active",currentPeriodStart:currentPeriodStart??prev.currentPeriodStart,currentPeriodEnd:currentPeriodEnd??prev.currentPeriodEnd,startedAt:activatedAt}});
    },
    markPastDue({subscriptionId,sourceEventId,reason="payment_overdue"}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId); mutable(prev);
      if(prev.status!=="active")throw new SubscriptionDomainError("invalid_subscription_transition","only active subscriptions can become past_due",{status:prev.status});
      return append({previous:prev,sourceEventId,type:"subscription.past_due",data:{reason},patch:{status:"past_due"}});
    },
    suspend({subscriptionId,sourceEventId,reason="delinquency"}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId); mutable(prev);
      if(!["active","past_due"].includes(prev.status))throw new SubscriptionDomainError("invalid_subscription_transition","only active or past_due subscriptions can suspend",{status:prev.status});
      return append({previous:prev,sourceEventId,type:"subscription.suspended",data:{reason},patch:{status:"suspended"}});
    },
    recover({subscriptionId,sourceEventId,reason="payment_recovered"}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId); mutable(prev);
      if(!["past_due","suspended"].includes(prev.status))throw new SubscriptionDomainError("invalid_subscription_transition","only past_due or suspended subscriptions can recover",{status:prev.status});
      return append({previous:prev,sourceEventId,type:"subscription.recovered",data:{reason},patch:{status:"active"}});
    },
    schedulePlanChange({subscriptionId,product,plan,sourceEventId,effectiveAt}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId); mutable(prev);
      if(prev.status==="pending")throw new SubscriptionDomainError("invalid_subscription_transition","pending subscription cannot schedule plan changes");
      const i=ident(product,plan);
      if(i.productId===prev.productId&&i.productVersion===prev.productVersion&&i.planId===prev.planId&&i.planVersion===prev.planVersion)throw new SubscriptionDomainError("plan_change_noop","target plan is already current");
      return append({previous:prev,sourceEventId,type:"subscription.plan_change_scheduled",data:i,patch:{pendingChange:{...i,effectiveAt}}});
    },
    applyScheduledPlanChange({subscriptionId,sourceEventId,effectiveAt=now()}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId); mutable(prev);
      if(!prev.pendingChange)throw new SubscriptionDomainError("plan_change_not_scheduled","no plan change is scheduled");
      const at=requireIso(effectiveAt,"effectiveAt");
      if(Date.parse(at)<Date.parse(prev.pendingChange.effectiveAt))throw new SubscriptionDomainError("plan_change_not_due","plan change is not due");
      const t=prev.pendingChange;
      return append({previous:prev,sourceEventId,type:"subscription.plan_changed",data:{previousProductId:prev.productId,previousPlanId:prev.planId,productId:t.productId,planId:t.planId},patch:{productId:t.productId,productVersion:t.productVersion,planId:t.planId,planVersion:t.planVersion,pendingChange:null}});
    },
    renew({subscriptionId,sourceEventId,currentPeriodStart,currentPeriodEnd}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId);
      if(prev.status!=="active")throw new SubscriptionDomainError("invalid_subscription_transition","only active subscriptions can renew",{status:prev.status});
      if(prev.cancelAtPeriodEnd)throw new SubscriptionDomainError("cancellation_scheduled","subscription scheduled for cancellation cannot renew");
      const start=requireIso(currentPeriodStart,"currentPeriodStart");
      if(Date.parse(start)<Date.parse(prev.currentPeriodEnd))throw new SubscriptionDomainError("overlapping_billing_period","renewal period cannot overlap current period");
      let patch={currentPeriodStart:start,currentPeriodEnd},changed=false;
      if(prev.pendingChange&&Date.parse(prev.pendingChange.effectiveAt)<=Date.parse(start)){changed=true;patch={...patch,...prev.pendingChange,pendingChange:null};delete patch.effectiveAt}
      return append({previous:prev,sourceEventId,type:"subscription.renewed",data:{previousPeriodEnd:prev.currentPeriodEnd,planChanged:changed,previousPlanId:prev.planId,planId:changed?patch.planId:prev.planId},patch});
    },
    cancel({subscriptionId,sourceEventId,mode="period_end",reason="requested",effectiveAt=now()}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId); mutable(prev);
      if(mode==="period_end"){
        if(prev.status==="pending")throw new SubscriptionDomainError("invalid_subscription_transition","pending subscription must be cancelled immediately");
        return append({previous:prev,sourceEventId,type:"subscription.cancellation_scheduled",data:{reason,effectiveAt:prev.currentPeriodEnd},patch:{cancelAtPeriodEnd:true,pendingChange:null}});
      }
      if(mode!=="immediate")throw new SubscriptionDomainError("invalid_cancel_mode","cancel mode is not supported");
      const endedAt=requireIso(effectiveAt,"effectiveAt");
      return append({previous:prev,sourceEventId,type:"subscription.cancelled",data:{reason,mode},patch:{status:"cancelled",endedAt,cancelAtPeriodEnd:false,pendingChange:null,startedAt:prev.startedAt??endedAt}});
    },
    finalizePeriodEnd({subscriptionId,sourceEventId,endedAt}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId);
      if(!prev.cancelAtPeriodEnd)throw new SubscriptionDomainError("cancellation_not_scheduled","subscription is not scheduled for cancellation");
      const at=requireIso(endedAt??prev.currentPeriodEnd,"endedAt");
      if(Date.parse(at)<Date.parse(prev.currentPeriodEnd))throw new SubscriptionDomainError("period_not_finished","current billing period has not finished");
      return append({previous:prev,sourceEventId,type:"subscription.cancelled",data:{reason:"period_end",mode:"period_end"},patch:{status:"cancelled",endedAt:at,cancelAtPeriodEnd:false,pendingChange:null}});
    },
    expire({subscriptionId,sourceEventId,endedAt=now(),reason="expired"}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId); mutable(prev);
      return append({previous:prev,sourceEventId,type:"subscription.expired",data:{reason},patch:{status:"expired",endedAt,cancelAtPeriodEnd:false,pendingChange:null,startedAt:prev.startedAt??endedAt}});
    },
    getCurrent:current,
    listHistory:id=>repository.listHistory(id),
    listCurrentByTenant:id=>repository.listCurrentByTenant(id),
  });
}
