const JSON_HEADERS = Object.freeze({"content-type":"application/json; charset=utf-8"});

function reply(status,payload){
  return Object.freeze({status,headers:JSON_HEADERS,body:JSON.stringify(payload)});
}
function requireMethod(value,method,name){
  if(!value||typeof value[method]!=="function") throw new TypeError(`${name}.${method} must be a function`);
  return value;
}
function safeBoundary(evaluation){
  return evaluation?.environment==="sandbox"
    && evaluation?.controls?.financialEgress==="blocked"
    && evaluation?.controls?.realMoney===false
    && evaluation?.controls?.biometricMaterialAccepted===false;
}
function publicEvaluation(evaluation){
  return Object.freeze({
    tenantId:evaluation.tenantId,
    workspaceId:evaluation.workspaceId,
    productId:evaluation.productId,
    planId:evaluation.planId,
    displayName:evaluation.displayName,
    status:evaluation.status,
    environment:evaluation.environment,
    createdAt:evaluation.createdAt,
    expiresAt:evaluation.expiresAt,
    capabilities:Object.freeze([...(evaluation.capabilities??[])]),
    scopes:Object.freeze([...(evaluation.scopes??[])]),
    limits:Object.freeze({...evaluation.limits}),
    controls:Object.freeze({...evaluation.controls}),
  });
}
function knownFailure(error){
  const map={
    TRUST_EVALUATION_NOT_FOUND:[404,"evaluation_not_found"],
    TRUST_EVALUATION_EXPIRED:[410,"evaluation_expired"],
    TRUST_EVALUATION_INACTIVE:[403,"evaluation_inactive"],
  };
  return map[error?.code]??null;
}

export function createGlobalTrustEvaluationHttpHandler({authenticator,evaluationTenantService}={}){
  const auth=requireMethod(authenticator,"authenticate","authenticator");
  const evaluations=requireMethod(evaluationTenantService,"assertEvaluationActive","evaluationTenantService");

  return Object.freeze({
    async handleRequest({method="GET",url="/",headers={}}={}){
      const requestUrl=new URL(String(url),"http://api-gateway.local");
      if(String(method).toUpperCase()!=="GET"||requestUrl.pathname!=="/v1/trust/evaluation") return null;

      const identity=await auth.authenticate(headers);
      if(!identity) return reply(401,{allowed:false,reason:"unauthorized"});

      const principal=identity.principal??{};
      const tenantId=String(principal.tenantId??"").trim();
      if(!tenantId) return reply(403,{allowed:false,reason:"tenant_context_unavailable"});

      const scopes=Array.isArray(principal.scopes)?principal.scopes:[];
      if(!scopes.includes("trust:evaluate")){
        return reply(403,{allowed:false,reason:"scope_required",requiredScope:"trust:evaluate"});
      }

      let evaluation;
      try{
        evaluation=await evaluations.assertEvaluationActive(tenantId);
      }catch(error){
        const failure=knownFailure(error);
        if(failure) return reply(failure[0],{allowed:false,reason:failure[1]});
        throw error;
      }

      if(evaluation?.tenantId!==tenantId) return reply(403,{allowed:false,reason:"tenant_boundary_mismatch"});
      if(!safeBoundary(evaluation)) return reply(503,{allowed:false,reason:"evaluation_boundary_invalid"});

      return reply(200,{allowed:true,evaluation:publicEvaluation(evaluation)});
    },
  });
}
