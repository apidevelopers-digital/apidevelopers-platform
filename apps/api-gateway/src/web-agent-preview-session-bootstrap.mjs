import { randomBytes } from "node:crypto";
import { hashBrowserSessionSecret, serializeBrowserSessionCookie } from "@apidevelopers/auth-core/browser-session-authenticator";
import { createWebAgentShadowCommercialContextId, webAgentShadowPersistenceCollections as C } from "./web-agent-shadow-persistence-providers.mjs";

export const uniCoPreviewLoginHost="unico-preview.apidevelopers.digital";
export const uniCoPreviewProductId="product:uni-co";
export const uniCoPreviewAgentId="uni.co";
const req=(v,n)=>{v=String(v??"").trim();if(!v)throw new TypeError(`${n} is required`);return v};

export function createUniCoPreviewBrowserSessionBootstrap({store,verifyCredentials,resolveAccess,clock=()=>new Date(),generateSecret=()=>randomBytes(32).toString("base64url"),sessionTtlSeconds=1800}={}){
 if(!store||typeof store.transaction!=="function")throw new TypeError("store is required");
 if(typeof verifyCredentials!=="function"||typeof resolveAccess!=="function")throw new TypeError("credential and access resolvers are required");
 if(!Number.isInteger(sessionTtlSeconds)||sessionTtlSeconds<300||sessionTtlSeconds>43200)throw new TypeError("invalid session ttl");
 return Object.freeze({async login({host,email,password}={}){
  if(String(host??"").trim().toLowerCase()!==uniCoPreviewLoginHost){const e=new Error("preview_login_surface_not_allowed");e.status=403;throw e}
  const normalizedEmail=req(email,"email").toLowerCase();
  const identity=await verifyCredentials({email:normalizedEmail,password:req(password,"password")});
  if(!identity||typeof identity!=="object")throw new Error("preview_identity_verification_failed");
  const a=await resolveAccess({email:normalizedEmail,identity,productId:uniCoPreviewProductId,requiredScopes:["web:chat"]});
  const principalId=req(a?.principalId,"principalId"),tenantId=req(a?.tenantId,"tenantId"),workspaceId=req(a?.workspaceId,"workspaceId"),accessGrantId=req(a?.accessGrantId,"accessGrantId");
  const now=clock();if(!(now instanceof Date)||Number.isNaN(now.getTime()))throw new TypeError("invalid clock");
  const expiresAt=new Date(now.getTime()+sessionTtlSeconds*1000).toISOString();
  const sessionSecret=generateSecret(),sessionHash=hashBrowserSessionSecret(sessionSecret);
  const commercialContextId=createWebAgentShadowCommercialContextId({tenantId,workspaceId,productId:uniCoPreviewProductId});
  await store.transaction(tx=>{
   tx.put(C.browserSessions,sessionHash,{sessionHash,status:"active",expiresAt,principal:{id:principalId,tenantId,name:req(identity.name??normalizedEmail,"identity.name"),status:"active",scopes:["web:chat"]}},{ifAbsent:true});
   tx.put(C.tenantInternationalProfiles,tenantId,{tenantId,defaultLocale:"pt-BR",fallbackLocale:"en",timeZone:"America/Sao_Paulo",legalRegion:"BR"});
   tx.put(C.commercialContexts,commercialContextId,{commercialContextId,tenantId,workspaceId,productId:uniCoPreviewProductId,currency:"BRL"});
  });
  return Object.freeze({ok:true,authenticated:true,productId:uniCoPreviewProductId,agentId:uniCoPreviewAgentId,workspaceId,accessGrantId,expiresAt,setCookie:serializeBrowserSessionCookie({sessionSecret,maxAgeSeconds:sessionTtlSeconds})});
 }});
}
