
import {createEntitlementSnapshot,EntitlementDomainError,freeze,iso,req} from "./model.mjs";
import {createMemoryEntitlementRepository} from "./repository.mjs";
function catalogRights(product,plan){
  if(product?.status!=="READY_TO_SELL")throw new EntitlementDomainError("product_not_sellable","product");
  if(plan?.status!=="ACTIVE")throw new EntitlementDomainError("plan_not_active","plan");
  if(plan.productId!==product.id)throw new EntitlementDomainError("plan_product_mismatch","product mismatch");
  if(!product.planIds?.includes(plan.id))throw new EntitlementDomainError("plan_not_declared_by_product","not declared");
  return {productId:product.id,productVersion:product.version,planId:plan.id,planVersion:plan.version,apiIds:product.apiIds??[],entitlements:plan.entitlements??[],meters:plan.meters??[]}
}
const evt=(type,s,at,data={})=>freeze({type,entitlementSnapshotId:s.id,subscriptionId:s.subscriptionId,tenantId:s.tenantId,occurredAt:at,data})
export function createEntitlementService({repository=createMemoryEntitlementRepository(),idFactory,clock=()=>new Date().toISOString(),assertTenantOperational=()=>true}={}){
  if(typeof idFactory!=="function")throw new EntitlementDomainError("invalid_argument","idFactory");
  const now=()=>iso(clock(),"clock"), current=(id,at=now())=>{const s=repository.getCurrentBySubscription(id,at);if(!s)throw new EntitlementDomainError("entitlement_not_found","not found",{subscriptionId:id,at});return s};
  function appendRevision({cur=null,sourceEventId,effectiveFrom,effectiveTo,status,reason=null,rights,tenantId,projectId,subscriptionId,metadata={},eventType,eventData={}}){
    const createdAt=now(),r=repository.append(createEntitlementSnapshot({id:req(idFactory(),"idFactory result"),revision:(cur?.revision??0)+1,tenantId:tenantId??cur?.tenantId,projectId:projectId===undefined?(cur?.projectId??null):projectId,subscriptionId:subscriptionId??cur?.subscriptionId,productId:rights?.productId??cur?.productId,productVersion:rights?.productVersion??cur?.productVersion,planId:rights?.planId??cur?.planId,planVersion:rights?.planVersion??cur?.planVersion,status,apiIds:status==="active"?(rights?.apiIds??cur?.apiIds??[]):[],entitlements:status==="active"?(rights?.entitlements??cur?.entitlements??[]):[],meters:status==="active"?(rights?.meters??cur?.meters??[]):[],effectiveFrom,effectiveTo,sourceEventId,reason,previousSnapshotId:cur?.id??null,createdAt,metadata}));
    return freeze({...r,events:r.appended?[evt(eventType,r.snapshot,createdAt,eventData)]:[]})
  }
  return Object.freeze({
    repositoryKind:repository.kind??"custom",
    materialize({tenantId,projectId=null,subscriptionId,product,plan,sourceEventId,startsAt=now(),endsAt=null,metadata={}}){
      tenantId=req(tenantId,"tenantId");assertTenantOperational(tenantId);
      if(repository.listHistory(subscriptionId).length)throw new EntitlementDomainError("entitlement_already_materialized","history exists");
      const rights=catalogRights(product,plan);
      return appendRevision({sourceEventId,effectiveFrom:startsAt,effectiveTo:endsAt,status:"active",rights,tenantId,projectId,subscriptionId,metadata,eventType:"entitlement.materialized",eventData:{productId:rights.productId,planId:rights.planId}})
    },
    changePlan({subscriptionId,product,plan,sourceEventId,effectiveAt=now(),metadata={}}){
      const cur=current(subscriptionId,effectiveAt),rights=catalogRights(product,plan);
      return appendRevision({cur,sourceEventId,effectiveFrom:effectiveAt,effectiveTo:cur.effectiveTo,status:cur.status==="suspended"?"suspended":"active",rights,metadata,eventType:"entitlement.plan_changed",eventData:{previousPlanId:cur.planId,planId:rights.planId}})
    },
    suspend({subscriptionId,sourceEventId,reason,effectiveAt=now(),metadata={}}){
      const cur=current(subscriptionId,effectiveAt);if(cur.status!=="active")throw new EntitlementDomainError("invalid_entitlement_transition","only active");
      return appendRevision({cur,sourceEventId,effectiveFrom:effectiveAt,effectiveTo:cur.effectiveTo,status:"suspended",reason,metadata,eventType:"entitlement.suspended",eventData:{reason}})
    },
    reactivate({subscriptionId,product,plan,sourceEventId,effectiveAt=now(),metadata={}}){
      const cur=current(subscriptionId,effectiveAt);if(cur.status!=="suspended")throw new EntitlementDomainError("invalid_entitlement_transition","only suspended");
      const rights=catalogRights(product,plan);
      return appendRevision({cur,sourceEventId,effectiveFrom:effectiveAt,effectiveTo:cur.effectiveTo,status:"active",rights,metadata,eventType:"entitlement.reactivated",eventData:{planId:rights.planId}})
    },
    cancel({subscriptionId,sourceEventId,reason="cancelled",effectiveAt=now(),metadata={}}){
      const cur=current(subscriptionId,effectiveAt);if(["cancelled","expired"].includes(cur.status))throw new EntitlementDomainError("invalid_entitlement_transition","terminal");
      return appendRevision({cur,sourceEventId,effectiveFrom:effectiveAt,effectiveTo:null,status:"cancelled",reason,metadata,eventType:"entitlement.cancelled",eventData:{reason}})
    },
    expire({subscriptionId,sourceEventId,effectiveAt=now(),metadata={}}){
      const cur=current(subscriptionId,effectiveAt);
      return appendRevision({cur,sourceEventId,effectiveFrom:effectiveAt,effectiveTo:null,status:"expired",reason:"expired",metadata,eventType:"entitlement.expired"})
    },
    getCurrent:current,listHistory:id=>repository.listHistory(id),
    assertAccess({subscriptionId,apiId=null,entitlementKey=null,requested=1,at=now()}){
      const s=current(subscriptionId,at);
      if(s.status!=="active")throw new EntitlementDomainError("entitlement_not_active","not active",{status:s.status});
      if(apiId!==null&&!s.apiIds.includes(req(apiId,"apiId")))throw new EntitlementDomainError("api_not_entitled","api",{apiId});
      let ent=null;
      if(entitlementKey!==null){
        ent=s.entitlements.find(x=>x.key===req(entitlementKey,"entitlementKey"));
        if(!ent||ent.value===false)throw new EntitlementDomainError("capability_not_entitled","capability");
        if(typeof ent.value==="number"&&ent.value<requested)throw new EntitlementDomainError("entitlement_value_exceeded","exceeded",{requested,allowed:ent.value})
      }
      return freeze({allowed:true,snapshot:s,entitlement:ent})
    }
  })
}
