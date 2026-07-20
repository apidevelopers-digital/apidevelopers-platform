import {SubscriptionDomainError,requireIso,requireText} from "./model.mjs";
import {identifyPlan} from "./service-context.mjs";

export function createLifecycleOperations(ctx){
  const {repository,assertTenantOperational,now,current,duplicate,mutable,append}=ctx;
  return {
    createPending({subscriptionId,tenantId,product,plan,sourceEventId,currentPeriodStart,currentPeriodEnd,billingAnchor=currentPeriodStart,billingInterval="month",metadata={}}){
      const repeated=duplicate(sourceEventId); if(repeated)return repeated;
      const tid=requireText(tenantId,"tenantId"); assertTenantOperational(tid);
      if(repository.getCurrent(subscriptionId))throw new SubscriptionDomainError("subscription_already_exists","subscription already exists");
      const i=identifyPlan(product,plan);
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
  };
}
