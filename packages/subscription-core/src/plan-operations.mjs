import {SubscriptionDomainError,requireIso} from "./model.mjs";
import {identifyPlan} from "./service-context.mjs";

export function createPlanOperations(ctx){
  const {now,current,duplicate,mutable,append}=ctx;
  return {
    schedulePlanChange({subscriptionId,product,plan,sourceEventId,effectiveAt}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const prev=current(subscriptionId); mutable(prev);
      if(prev.status==="pending")throw new SubscriptionDomainError("invalid_subscription_transition","pending subscription cannot schedule plan changes");
      const i=identifyPlan(product,plan);
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
  };
}
