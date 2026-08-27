import { createCanonicalId } from "@apidevelopers/contracts";

const JSON_HEADERS = Object.freeze({"content-type":"application/json; charset=utf-8"});

export const TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID = createCanonicalId({
  family: "component",
  segments: ["organization", "apidevelopers-digital"],
});

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
    TRUST_EVALUATION_KEY_ENROLLMENT_UNAUTHORIZED:[401,"unauthorized"],
    TRUST_EVALUATION_KEY_ENROLLMENT_FORBIDDEN:[403,"admin_scope_required"],
  };
  return map[error?.code]??null;
}
function publicEnrollment(enrollment){
  if(!enrollment) {
    return Object.freeze({
      organizationId: TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID,
      enrollmentPresent: false,
      status: "missing",
      keyPossessionVerified: false,
      identityVerifiedByThisService: false,
    });
  }
  return Object.freeze({
    organizationId: enrollment.organizationId,
    enrollmentPresent: true,
    enrollmentId: enrollment.enrollmentId,
    status: enrollment.status,
    recipientKeyFingerprint: enrollment.recipientKeyFingerprint,
    keyPossessionVerified: enrollment.keyPossessionVerified === true,
    identityVerifiedByThisService: enrollment.identityVerifiedByThisService === true,
    approvalReference: enrollment.approvalReference,
    approvedBy: enrollment.approvedBy,
    approvedAt: enrollment.approvedAt,
    recordedBy: enrollment.recordedBy,
    recordedAt: enrollment.recordedAt,
  });
}

export function createGlobalTrustEvaluationHttpHandler({
  authenticator,
  evaluationTenantService,
  recipientKeyEnrollmentService,
}={}){
  const auth=requireMethod(authenticator,"authenticate","authenticator");
  const evaluations=requireMethod(evaluationTenantService,"assertEvaluationActive","evaluationTenantService");
  const enrollments = recipientKeyEnrollmentService
    ? requireMethod(recipientKeyEnrollmentService,"getApprovedEnrollment","recipientKeyEnrollmentService")
    : null;

  return Object.freeze({
    async handleRequest({method="GET",url="/",headers={}}={}){
      const requestUrl=new URL(String(url),"http://api-gateway.local");
      const normalizedMethod=String(method).toUpperCase();

      if(normalizedMethod==="GET" && requestUrl.pathname==="/v1/trust/evaluation/operator/institutional-enrollment"){
        if(!enrollments) return reply(503,{allowed:false,reason:"enrollment_service_unavailable"});
        const identity=await auth.authenticate(headers);
        if(!identity) return reply(401,{allowed:false,reason:"unauthorized"});
        try{
          const enrollment=await enrollments.getApprovedEnrollment({
            identity,
            organizationId: TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID,
          });
          return reply(200,{
            allowed:true,
            institution:Object.freeze({
              displayName:"API Developers.digital",
              githubOrganization:"apidevelopers-digital",
              organizationId:TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID,
            }),
            enrollment:publicEnrollment(enrollment),
            secretsIncluded:false,
            privateKeyIncluded:false,
          });
        }catch(error){
          const failure=knownFailure(error);
          if(failure) return reply(failure[0],{allowed:false,reason:failure[1]});
          throw error;
        }
      }

      if(normalizedMethod!=="GET"||requestUrl.pathname!=="/v1/trust/evaluation") return null;

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
