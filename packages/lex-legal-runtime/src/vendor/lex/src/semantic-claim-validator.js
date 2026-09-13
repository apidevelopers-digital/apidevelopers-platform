const OPENAI_URL = "https://api.openai.com/v1/responses";
const ALLOWED = new Set(["supported","partially_supported","not_supported","inconclusive"]);

function clean(v, n=6000){ return String(v ?? "").replace(/\s+/g," ").trim().slice(0,n); }

function semanticReadiness(env=process.env){
  const key=clean(env.OPENAI_API_KEY,1000), model=clean(env.OPENAI_MODEL,200);
  const enabled=String(env.AI_ENABLED||"").toLowerCase()==="true";
  return {enabled,api_key_present:Boolean(key),model_present:Boolean(model),model:model||null,ready:enabled&&Boolean(key)&&Boolean(model)};
}

function textOf(x={}){
  return [x.title,x.titulo,x.content,x.conteudo,x.summary,x.resumo,x.ementa,x.tese_juridica,x.decisao,x.text,x.trecho]
    .filter(Boolean).map(v=>clean(v,5000)).join("\n").slice(0,10000);
}

function compactEvidence(x={},i=0){
  const v=x.verification||{};
  return {
    evidence_id:`E${i+1}`,
    provider:clean(x.provider||x.source,120)||null,
    identifier:v.identifier?.value||clean(x.processo||x.numero_registro||x.identifier||x.urn||x.id,250)||null,
    source_url:v.source_url||x.source_url||x.url||null,
    citation_ready:Boolean(v.citation_ready),
    substantive_use_allowed:Boolean(v.substantive_use_allowed),
    text:textOf(x)
  };
}

function outputText(data){
  if(typeof data?.output_text==="string") return data.output_text.trim();
  const out=[];
  for(const item of Array.isArray(data?.output)?data.output:[]){
    for(const c of Array.isArray(item?.content)?item.content:[]){
      if(c?.type==="output_text"&&typeof c.text==="string") out.push(c.text);
    }
  }
  return out.join("\n").trim();
}

function parseResult(raw){
  let s=clean(raw,12000); if(!s) return null;
  const f=s.match(/```(?:json)?\s*([\s\S]*?)```/i); if(f) s=f[1].trim();
  const a=s.indexOf("{"), b=s.lastIndexOf("}"); if(a>=0&&b>a) s=s.slice(a,b+1);
  try{
    const p=JSON.parse(s), classification=ALLOWED.has(p.classification)?p.classification:"inconclusive";
    return {
      classification,
      rationale:clean(p.rationale,1000)||null,
      supported_points:Array.isArray(p.supported_points)?p.supported_points.map(v=>clean(v,350)).filter(Boolean).slice(0,8):[],
      unsupported_points:Array.isArray(p.unsupported_points)?p.unsupported_points.map(v=>clean(v,350)).filter(Boolean).slice(0,8):[],
      evidence_ids:Array.isArray(p.evidence_ids)?p.evidence_ids.map(v=>clean(v,40)).filter(Boolean).slice(0,20):[]
    };
  }catch{return null;}
}

async function assessSemanticClaim({claim,evidence=[],precheck=null,fetchImpl=globalThis.fetch,env=process.env,timeoutMs=45000}={}){
  const statement=clean(claim,12000), rows=Array.isArray(evidence)?evidence.slice(0,20):[], readiness=semanticReadiness(env);
  if(!statement) return {ok:false,status:"claim_required",classification:"inconclusive",semantic_entailment_verified:false,human_review_required:true};
  if(!rows.length) return {ok:true,status:"evidence_required",classification:"inconclusive",semantic_entailment_verified:false,human_review_required:true};
  if(precheck&&!["candidate_support","weak_candidate"].includes(precheck.claim_support)){
    return {ok:true,status:"blocked_by_precheck",classification:"inconclusive",semantic_entailment_verified:false,human_review_required:true,precheck_claim_support:precheck.claim_support||null};
  }
  if(!readiness.ready) return {ok:true,status:"semantic_ai_not_configured",classification:"inconclusive",readiness,semantic_entailment_verified:false,human_review_required:true};

  const eligible=rows.map(compactEvidence).filter(x=>x.citation_ready&&x.substantive_use_allowed&&x.text);
  if(!eligible.length) return {ok:true,status:"no_semantically_eligible_evidence",classification:"inconclusive",readiness,semantic_entailment_verified:false,human_review_required:true};

  const instructions=[
    "Você é um validador semântico jurídico conservador.",
    "Avalie SOMENTE se as evidências fornecidas sustentam a afirmação.",
    "Não use conhecimento externo, não crie fatos e não complete lacunas.",
    "Classifique apenas como supported, partially_supported, not_supported ou inconclusive.",
    "supported exige suporte direto; partially_supported exige suporte apenas parcial; not_supported quando a evidência não sustenta ou contradiz; inconclusive em dúvida ou texto insuficiente.",
    "Nunca trate sobreposição lexical como prova semântica.",
    "Responda APENAS JSON válido com classification, rationale, supported_points, unsupported_points, evidence_ids.",
    "rationale deve ser curto e auditável, sem cadeia de raciocínio privada."
  ].join(" ");

  const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{
    const r=await fetchImpl(OPENAI_URL,{
      method:"POST",
      headers:{"content-type":"application/json",authorization:`Bearer ${env.OPENAI_API_KEY}`},
      body:JSON.stringify({model:readiness.model,instructions,input:JSON.stringify({claim:statement,evidence:eligible,constraints:{external_knowledge_forbidden:true,human_review_required:true,no_invention_policy:true}}),store:false}),
      signal:ctl.signal
    });
    const raw=await r.text(); let data=null; try{data=raw?JSON.parse(raw):null;}catch{}
    if(!r.ok) return {ok:true,status:"semantic_ai_upstream_error",classification:"inconclusive",upstream_http_status:r.status,semantic_entailment_verified:false,human_review_required:true};
    const parsed=parseResult(outputText(data));
    if(!parsed) return {ok:true,status:"semantic_ai_invalid_output",classification:"inconclusive",semantic_entailment_verified:false,human_review_required:true};
    return {ok:true,status:"semantic_assessment_complete",...parsed,provider:"openai",model:readiness.model,evaluated_evidence_count:eligible.length,semantic_entailment_verified:parsed.classification==="supported",safe_to_state_as_verified_claim:false,human_review_required:true,no_invention_policy:true};
  }catch(e){
    return {ok:true,status:e?.name==="AbortError"?"semantic_ai_timeout":"semantic_ai_fetch_failed",classification:"inconclusive",semantic_entailment_verified:false,human_review_required:true};
  }finally{clearTimeout(timer);}
}

export {assessSemanticClaim,semanticReadiness,parseResult,compactEvidence};
