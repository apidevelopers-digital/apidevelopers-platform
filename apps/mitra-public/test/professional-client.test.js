import test from "node:test";
import assert from "node:assert/strict";
import { createProfessionalClient, ProfessionalClientError } from "../src/professional-client.js";

function response(status,payload){return{ok:status>=200&&status<300,status,async json(){return payload}}}

test("client omits browser credentials and uses professional analyze route",async()=>{
 let captured;
 const client=createProfessionalClient({baseUrl:"https://gateway.apidevelopers.digital",fetchImpl:async(url,options)=>{captured={url,options};return response(200,{ok:true,capability:"assistant"})}});
 const out=await client.analyze({question:"Qual tese devo revisar?",facts:["Fato 1"]});
 assert.equal(out.ok,true);
 assert.equal(captured.url,"https://gateway.apidevelopers.digital/v1/mitra/professional/analyze");
 assert.equal(captured.options.credentials,"omit");
 assert.equal(captured.options.cache,"no-store");
 assert.equal(captured.options.headers.authorization,undefined);
 assert.equal(captured.options.headers.cookie,undefined);
});

test("client exposes all professional capability routes",async()=>{
 const paths=[];
 const client=createProfessionalClient({baseUrl:"https://gateway.apidevelopers.digital",fetchImpl:async(url)=>{paths.push(new URL(url).pathname);return response(200,{ok:true})}});
 await client.health();
 await client.jurimetrics({tribunal:"TJSP",query:"responsabilidade civil",limit:10});
 await client.veritas({mode:"claim_precheck",claim:"A norma está vigente.",evidence:{source:"Fonte oficial"}});
 await client.documentPreview({documentType:"legal_brief",objective:"Organizar argumentos.",facts:[]});
 assert.deepEqual(paths,[
  "/v1/mitra/professional/health",
  "/v1/mitra/professional/jurimetrics",
  "/v1/mitra/professional/veritas",
  "/v1/mitra/professional/document/preview",
 ]);
});

test("client is fail-closed without an API base",async()=>{
 const client=createProfessionalClient();
 assert.equal(client.configured,false);
 await assert.rejects(()=>client.health(),(error)=>error instanceof ProfessionalClientError&&error.code==="not_configured"&&error.status===503);
});

test("client rejects insecure non-local base URLs",()=>{
 assert.throws(()=>createProfessionalClient({baseUrl:"http://gateway.apidevelopers.digital"}),(error)=>error instanceof ProfessionalClientError&&error.code==="insecure_base_url");
});
