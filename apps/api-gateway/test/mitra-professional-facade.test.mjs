import test from"node:test";
import assert from"node:assert/strict";
import{createMitraProfessionalFacade}from"../src/mitra-professional-facade.mjs";

const ORIGIN="https://preview-apidevelopers.apidevelopers.digital";
function response(status,payload){return{ok:status>=200&&status<300,status,async json(){return payload}}}
function request(path,body,headers={}){
 return{method:"POST",url:path,headers:{origin:ORIGIN,"x-real-ip":"203.0.113.40",authorization:"Bearer browser-must-not-forward",cookie:"office_session=private",...headers},body:JSON.stringify(body)};
}

test("professional facade is fail-closed for protected capabilities when server bearer is absent",async()=>{
 const facade=createMitraProfessionalFacade({upstreamBearer:"",fetchImpl:async()=>{throw new Error("must not call")}});
 const health=await facade.handleRequest({method:"GET",url:"/v1/mitra/professional/health",headers:{origin:ORIGIN}});
 assert.equal(health.status,503);
 const healthBody=JSON.parse(health.body);
 assert.equal(healthBody.ok,false);
 assert.equal(healthBody.capabilities.documents,"ephemeral_structured_preview");
 const analyze=await facade.handleRequest(request("/v1/mitra/professional/analyze",{question:"Qual a tese aplicável?"}));
 assert.equal(analyze.status,503);
 assert.equal(JSON.parse(analyze.body).error,"professional_upstream_not_configured");
});

test("document preview is ephemeral, citation-backed and works without an upstream bearer",async()=>{
 const facade=createMitraProfessionalFacade({upstreamBearer:"",fetchImpl:async()=>{throw new Error("must not call")}});
 const result=await facade.handleRequest(request("/v1/mitra/professional/document/preview",{
  documentType:"legal_brief",
  objective:"Organizar argumentos sobre responsabilidade civil.",
  facts:["Houve prestação de serviço de saúde.","Existe controvérsia sobre nexo causal."],
  instructions:"Revisar fundamentos antes de qualquer uso.",
  citations:[{title:"Fonte oficial",source:"Câmara dos Deputados",source_url:"https://dadosabertos.camara.leg.br/",citation:"Referência de teste"}],
 }));
 assert.equal(result.status,200);
 const body=JSON.parse(result.body);
 assert.equal(body.ok,true);
 assert.equal(body.status,"draft_preview");
 assert.equal(body.persistence,false);
 assert.equal(body.database_write_allowed,false);
 assert.equal(body.write_executed,false);
 assert.equal(body.human_review_required,true);
 assert.equal(body.citation_count,1);
 assert.match(body.content,/OBJETIVO/);
 assert.match(body.content,/FATOS INFORMADOS/);
 assert.match(body.content,/NOTA DE REVISÃO/);
});

test("assistant uses only server-side bearer, allowlisted payload and strips raw/token material",async()=>{
 let captured=null;
 const facade=createMitraProfessionalFacade({
  upstreamBearer:"server-only",
  fetchImpl:async(url,options)=>{
   captured={url:String(url),options};
   return response(200,{ok:true,path:"/v1/analyze",data:{answer:"Estratégia com revisão humana",raw:{secret:"never"},access_token:"never"}});
  },
 });
 const result=await facade.handleRequest(request("/v1/mitra/professional/analyze",{
  question:"Quais pontos jurídicos devo revisar?",
  facts:["Fato um","Fato dois"],
  tribunal:"STJ",
  limit:8,
 }));
 assert.equal(result.status,200);
 const body=JSON.parse(result.body);
 assert.equal(body.ok,true);
 assert.equal(body.capability,"assistant");
 assert.equal(body.result.data.answer,"Estratégia com revisão humana");
 assert.equal(body.result.data.raw,undefined);
 assert.equal(body.result.data.access_token,undefined);
 assert.equal(body.persistence,false);
 assert.equal(body.office_database_access,false);
 assert.equal(captured.url,"https://peterle-ops.apidevelopers.digital/mitra/orchestrator/dispatch");
 assert.equal(captured.options.headers.authorization,"Bearer server-only");
 assert.equal(captured.options.headers.cookie,undefined);
 const sent=JSON.parse(captured.options.body);
 assert.equal(sent.path,"/v1/analyze");
 assert.deepEqual(Object.keys(sent.payload).sort(),["facts","limit","question","tribunal"].sort());
 assert.equal(sent.payload.question,"Quais pontos jurídicos devo revisar?");
});

test("jurimetrics dispatch is forced to real read-only mode and rejects office/private fields",async()=>{
 let sent=null;
 const facade=createMitraProfessionalFacade({
  upstreamBearer:"server-only",
  fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return response(200,{ok:true,data:{read_only:true,total:12,sample:[{numero:"1"}]}})},
 });
 const result=await facade.handleRequest(request("/v1/mitra/professional/jurimetrics",{
  tribunal:"TJSP",query:"responsabilidade civil",limit:100,
 }));
 assert.equal(result.status,200);
 assert.equal(sent.path,"/v1/jurimetrics/search");
 assert.equal(sent.payload.dry_run,false);
 assert.equal(sent.payload.tribunal,"TJSP");
 assert.equal(sent.payload.query,"responsabilidade civil");
 assert.equal(JSON.parse(result.body).database_write_allowed,false);

 const blocked=await facade.handleRequest(request("/v1/mitra/professional/jurimetrics",{
  tribunal:"TJSP",client_id:"private-client",
 }));
 assert.equal(blocked.status,400);
 assert.equal(JSON.parse(blocked.body).error,"jurimetrics_unexpected_input");
});

test("Veritas accepts only governed modes and sends structured evidence",async()=>{
 let sent=null;
 const facade=createMitraProfessionalFacade({
  upstreamBearer:"server-only",
  fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return response(200,{ok:true,data:{status:"review_required"}})},
 });
 const result=await facade.handleRequest(request("/v1/mitra/professional/veritas",{
  mode:"claim_precheck",
  claim:"A norma X estava vigente na data Y.",
  evidence:{source:"Fonte oficial",citation:"Referência"},
  as_of_date:"2026-09-08",
 }));
 assert.equal(result.status,200);
 assert.equal(sent.path,"/v1/veritas");
 assert.equal(sent.payload.mode,"claim_precheck");
 assert.equal(sent.payload.as_of_date,"2026-09-08");
 assert.equal(JSON.parse(result.body).human_review_required,true);

 const invalid=await facade.handleRequest(request("/v1/mitra/professional/veritas",{
  mode:"certainty",
  claim:"algo",
  evidence:{source:"x"},
 }));
 assert.equal(invalid.status,400);
 assert.equal(JSON.parse(invalid.body).error,"veritas_mode_invalid");
});

test("professional CORS rejects unknown browser origins before upstream dispatch",async()=>{
 let calls=0;
 const facade=createMitraProfessionalFacade({upstreamBearer:"server-only",fetchImpl:async()=>{calls+=1;return response(200,{ok:true})}});
 const result=await facade.handleRequest({
  method:"POST",url:"/v1/mitra/professional/analyze",
  headers:{origin:"https://evil.example","x-real-ip":"203.0.113.50"},
  body:JSON.stringify({question:"teste"}),
 });
 assert.equal(result.status,403);
 assert.equal(JSON.parse(result.body).error,"origin_not_allowed");
 assert.equal(calls,0);
});
