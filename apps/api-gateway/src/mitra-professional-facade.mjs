import{
 MitraProfessionalError,clientKey,corsHeaders,createRateLimiter,ensureOrigin,jsonResponse,
 normalizeAllowedOrigins,normalizeHttpsBase,parseJsonBody,requiredText,safeFacts,safeLimit,sanitize,text
}from"./mitra-professional-common.mjs";
import{buildProfessionalDocumentPreview}from"./mitra-professional-document.mjs";
const UNCONFIGURED_BASE="https://not-configured.invalid";
const ROUTES=Object.freeze({
 health:"/v1/mitra/professional/health",
 analyze:"/v1/mitra/professional/analyze",
 jurimetrics:"/v1/mitra/professional/jurimetrics",
 veritas:"/v1/mitra/professional/veritas",
 documentPreview:"/v1/mitra/professional/document/preview",
});
const VERITAS_MODES=new Set(["claim_precheck","claim_semantic","normative_validity"]);
function analyze(body){
 const allowed=new Set(["question","facts","tribunal","limit"]);
 if(Object.keys(body).some(k=>!allowed.has(k)))throw new MitraProfessionalError(400,"analyze_unexpected_input","A análise recebeu campos não permitidos.");
 return{question:requiredText(body.question,"question",5_000),facts:safeFacts(body.facts),tribunal:text(body.tribunal,50)||undefined,limit:safeLimit(body.limit,10,20)};
}
function period(value){
 if(value===undefined||value===null)return undefined;
 if(!value||typeof value!=="object"||Array.isArray(value))throw new MitraProfessionalError(400,"period_invalid","periodo deve ser um objeto.");
 if(JSON.stringify(value).length>1_500)throw new MitraProfessionalError(400,"period_too_large","periodo excede o limite seguro.");
 return value;
}
function jurimetrics(body){
 const allowed=new Set(["tribunal","comarca","vara","orgao_julgador","magistrado","classe","classe_codigo","assunto","assunto_codigo","movimento","movimento_codigo","numeroProcesso","pedido","tese","query","periodo","limit"]);
 if(Object.keys(body).some(k=>!allowed.has(k)))throw new MitraProfessionalError(400,"jurimetrics_unexpected_input","A jurimetria recebeu campos não permitidos.");
 const out={dry_run:false,limit:safeLimit(body.limit,100,500)};
 for(const key of [...allowed].filter(x=>!["periodo","limit"].includes(x))){
  const value=text(body[key],["query","tese","pedido"].includes(key)?2_000:200);if(value)out[key]=value;
 }
 const p=period(body.periodo);if(p)out.periodo=p;
 if(!out.tribunal&&!out.query&&!out.numeroProcesso&&!out.assunto&&!out.classe&&!out.tese)throw new MitraProfessionalError(400,"jurimetrics_filter_required","Informe tribunal, consulta, processo, assunto, classe ou tese para a jurimetria.");
 return out;
}
function veritas(body){
 const allowed=new Set(["mode","claim","evidence","as_of_date","asOfDate"]);
 if(Object.keys(body).some(k=>!allowed.has(k)))throw new MitraProfessionalError(400,"veritas_unexpected_input","A verificação recebeu campos não permitidos.");
 const mode=text(body.mode,80).toLowerCase();if(!VERITAS_MODES.has(mode))throw new MitraProfessionalError(400,"veritas_mode_invalid","Modo Veritas inválido.");
 const claim=requiredText(body.claim,"claim",12_000),evidence=body.evidence;
 if(!evidence||typeof evidence!=="object")throw new MitraProfessionalError(400,"evidence_required","Informe evidência estruturada para o Veritas.");
 if(JSON.stringify(evidence).length>20_000)throw new MitraProfessionalError(400,"evidence_too_large","A evidência excede o limite seguro.");
 const out={mode,claim,evidence},asOf=text(body.as_of_date??body.asOfDate,40);if(asOf)out.as_of_date=asOf;return out;
}
function isRoute(path){return Object.values(ROUTES).includes(path)}
export function createMitraProfessionalFacade({
 upstreamBaseUrl=process.env.MITRA_PROFESSIONAL_ORCHESTRATOR_BASE_URL,
 upstreamBearer=process.env.MITRA_PROFESSIONAL_ORCHESTRATOR_BEARER,
 allowedOrigins=process.env.MITRA_PROFESSIONAL_ALLOWED_ORIGINS,
 fetchImpl=globalThis.fetch,
 timeoutMs=Number(process.env.MITRA_PROFESSIONAL_TIMEOUT_MS??18_000),
 rateLimitMax=Number(process.env.MITRA_PROFESSIONAL_RATE_LIMIT_MAX??20),
 rateLimitWindowMs=Number(process.env.MITRA_PROFESSIONAL_RATE_LIMIT_WINDOW_MS??60_000),
 now=()=>Date.now(),
}={}){
 const explicitBase=text(upstreamBaseUrl,2_000);
 const base=normalizeHttpsBase(explicitBase||UNCONFIGURED_BASE,UNCONFIGURED_BASE,"MITRA_PROFESSIONAL_ORCHESTRATOR_BASE_URL");
 const bearer=text(upstreamBearer,8_000),origins=normalizeAllowedOrigins(allowedOrigins),timeout=Math.max(1_000,Number(timeoutMs)||18_000);
 const limiter=createRateLimiter({now,max:Math.max(0,Math.floor(Number(rateLimitMax)||20)),windowMs:Math.max(1_000,Number(rateLimitWindowMs)||60_000)});
 const configured=Boolean(explicitBase&&bearer&&typeof fetchImpl==="function");
 async function dispatch(path,payload){
  if(!configured)throw new MitraProfessionalError(503,"professional_upstream_not_configured","A camada profissional da Mitra ainda não está configurada neste runtime.");
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await fetchImpl(`${base}/mitra/orchestrator/dispatch`,{
    method:"POST",headers:{accept:"application/json","content-type":"application/json",authorization:`Bearer ${bearer}`},
    body:JSON.stringify({path,payload}),signal:controller.signal,redirect:"error",cache:"no-store",
   });
   let data=null;try{data=await response.json()}catch{}
   if(!response.ok)throw new MitraProfessionalError(
    response.status>=500?502:400,"professional_upstream_rejected",
    text(data?.message??data?.error,500)||"O motor jurídico profissional não respondeu como esperado."
   );
   return sanitize(data);
  }catch(error){
   if(error instanceof MitraProfessionalError){throw error}
   if(error?.name==="AbortError")throw new MitraProfessionalError(504,"professional_upstream_timeout","O motor jurídico excedeu o tempo de resposta.");
   throw new MitraProfessionalError(502,"professional_upstream_unavailable","O motor jurídico profissional está indisponível.");
  }finally{clearTimeout(timer)}
 }
 return Object.freeze({
  configured,routes:ROUTES,
  async handleRequest({method="GET",url="/",headers={},body}={}){
   const verb=String(method).toUpperCase(),pathname=new URL(String(url),"http://api-gateway.local").pathname;
   if(!isRoute(pathname))return null;const origin=headers.origin;
   try{
    ensureOrigin(origin,origins);
    if(pathname===ROUTES.health&&verb==="GET")return jsonResponse(configured?200:503,{
     ok:configured,service:"mitra-professional",status:configured?"ready":"not_configured",
     capabilities:{research:true,assistant:configured,jurimetrics:configured,veritas:configured,documents:"ephemeral_structured_preview"},
     persistence:false,office_database_access:false,database_write_allowed:false,write_executed:false,human_review_required:true,final_legal_conclusion_disabled:true
    },origin,origins);
    if(verb==="OPTIONS")return{status:204,headers:corsHeaders(origin,origins,{"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type","access-control-max-age":"600"}),body:""};
    if(verb!=="POST")return jsonResponse(405,{ok:false,error:"method_not_allowed",write_executed:false},origin,origins);
    const rate=limiter.consume(clientKey(headers));
    if(!rate.allowed){const retry=Math.max(1,Math.ceil((rate.resetAt-now())/1_000));return jsonResponse(429,{ok:false,error:"rate_limited",message:"Limite temporário da Mitra Profissional atingido.",write_executed:false},origin,origins,{"retry-after":String(retry)})}
    const parsed=parseJsonBody(body);
    if(pathname===ROUTES.documentPreview)return jsonResponse(200,buildProfessionalDocumentPreview(parsed),origin,origins);
    let path,payload,capability;
    if(pathname===ROUTES.analyze){path="/v1/analyze";payload=analyze(parsed);capability="assistant"}
    else if(pathname===ROUTES.jurimetrics){path="/v1/jurimetrics/search";payload=jurimetrics(parsed);capability="jurimetrics"}
    else if(pathname===ROUTES.veritas){path="/v1/veritas";payload=veritas(parsed);capability="veritas"}
    else return null;
    const result=await dispatch(path,payload);
    return jsonResponse(200,{ok:true,capability,result,persistence:false,office_database_access:false,database_write_allowed:false,write_executed:false,human_review_required:true,final_legal_conclusion_disabled:true},origin,origins);
   }catch(error){
    if(error instanceof MitraProfessionalError)return jsonResponse(error.status,{ok:false,error:error.code,message:error.message,persistence:false,database_write_allowed:false,write_executed:false},origin,origins);
    throw error;
   }
  }
 });
}
