import { createHash } from "node:crypto";
import { createDurableRepository } from "@apidevelopers/persistence-core";

export const WEB_AGENT_SHADOW_MEMORY_COLLECTION ="web.agentMemoryRecords";
export const WEB_AGENT_SHADOW_MEMORY_SCHEMA="apidevelopers.web-agent-memory.v1";

const AGENTS=new Set(["uni.co","nexus"]);
const requireText=(value, name)=>{
  if(typeof value!=="string"||!value.trim())throw new TypeError(`${name} required`);
  return value.trim();
};

function assertAgent(agentId){
  const agent=requireText(agentId,"agentId");
  if(!AGENTS.has(agent))throw new RangeError("unsupported agentId");
  return agent;
}

export function deriveWebAgentContactKey(customerRef){
  return createHash("sha256").update(requireText(customerRef,"customerRef").toLowerCase(),"utf8").digest("hex");
}

export function createWebAgentShadowMemoryRecordId({agentId,tenantId,workspaceId,customerRef}){
  const identity=[assertAgent(agentId),requireText(tenantId,"tenantId"),requireText(workspaceId,"workspaceId"),deriveWebAgentContactKey(customerRef)].join("\0");
  return `web-agent-memory.${createHash("sha256").update(identity,"utf8").digest("hex")}`;
}

export function createWebAgentShadowMemoryProvider({ store }={}){
  const repo=createDurableRepository({store,collection:WEB_AGENT_SHADOW_MEMORY_COLLECTION,idField:"memoryRecordId"});

  async function recall({agentId,tenantId,workspaceId,customerRef}){
    const memoryRecordId=createWebAgentShadowMemoryRecordId({agentId,tenantId,workspaceId,customerRef});
    return repo.getById(memoryRecordId);
  }

  async function upsert({agentId,tenantId,workspaceId,customerRef,data={},updatedAt=new Date().toISOString()}){
    const normalizedAgent=assertAgent(agentId);
    const normalizedTenant=requireText(tenantId,"tenantId");
    const normalizedWorkspace=requireText(workspaceId,"workspaceId");
    const contactKey=deriveWebAgentContactKey(customerRef);
    const memoryRecordId=createWebAgentShadowMemoryRecordId({agentId:normalizedAgent,tenantId:normalizedTenant,workspaceId:normalizedWorkspace,customerRef});
    const record=Object.freeze({schema:WEB_AGENT_SHADOW_MEMORY_SCHEMA,memoryRecordId,agentId:normalizedAgent,tenantId:normalizedTenant,workspaceId:normalizedWorkspace,contactKey,data:structuredClone(data),updatedAt:requireText(updatedAt,"updatedAt")});
    return repo.upsert(record);
  }

  return Object.freeze({kind:"web-agent-shadow-memory-provider-v1",mode:"shadow",recall,upsert});
}
