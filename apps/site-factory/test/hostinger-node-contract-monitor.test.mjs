import test from "node:test";
import assert from "node:assert/strict";
import {EXPECTED as E,createHostingerNodeContractMonitorReport as evaluate} from "../src/hostinger-node-contract-monitor.mjs";
const R=s=>({"$ref":"#/components/schemas/"+s});
function fixture(){
 const F=["node_version","app_type","root_directory","output_directory","build_script","source_type","source_options"];
 const api={openapi:E.openapiVersion,info:{version:E.apiVersion},paths:{
 [E.uploadEndpoint]:{post:{operationId:E.uploadOperationId,requestBody:{required:true,content:{"application/json":{schema:R(E.uploadSchema)}}}}},
 [E.buildEndpoint]:{post:{operationId:E.buildOperationId,requestBody:{required:true,content:{"application/json":{schema:R(E.buildSchema)}}}}},
 [E.settingsEndpoint]:{get:{operationId:E.settingsOperationId,parameters:[{name:"archive_path",in:"query",required:true,schema:{type:"string"}}]}}
 },components:{schemas:{
 [E.uploadSchema]:{type:"object"},
 [E.buildSchema]:{required:F,properties:{source_type:{type:"string",enum:["archive"]},source_options:{properties:{archive_path:{type:"string"}}}}}
 }}};
 return {api,issue:{number:56,state:"closed",html_url:"https://github.com/hostinger/api/issues/56"}};
}
function run(f=fixture()){return evaluate({openapi:f.api,issue:f.issue,observedAt:"2026-10-16T12:00:00Z"});}
test("official archive workflow is unchanged, but deployment stays blocked",()=>{
 const a=run(),b=run();
 assert.equal(a.status,"unchanged-blocked");assert.equal(a.reviewRequired,false);
 assert.equal(a.fingerprint,b.fingerprint);
 assert.deepEqual(Object.values(a.barriers).filter(Boolean),[]);
});
test("API metadata-only drift is not treated as contract change",()=>{
 const f=fixture();f.api.info.version="2.2.0";
 assert.equal(run(f).status,"upstream-metadata-changed-blocked");
});
test("missing upload operation is review-required",()=>{
 const f=fixture();delete f.api.paths[E.uploadEndpoint];
 assert.equal(run(f).checks.uploadOperationIdMatches,false);assert.equal(run(f).reviewRequired,true);
});
test("legacy endpoint coming back is review-required",()=>{
 const f=fixture();f.api.paths[E.legacyEndpoint]={post:{}};
 assert.equal(run(f).checks.legacyEndpointAbsent,false);assert.equal(run(f).reviewRequired,true);
});
test("changed upload/build schema refs require review",()=>{
 const f=fixture();f.api.paths[E.uploadEndpoint].post.requestBody.content["application/json"].schema.$ref="#/invalid";
 f.api.paths[E.buildEndpoint].post.operationId="changed";
 assert.equal(run(f).reviewRequired,true);
});
test("archive source and required source_options are enforced",()=>{
 const f=fixture();const s=f.api.components.schemas[E.buildSchema];
 s.required.pop();s.properties.source_options.properties.archive_path.type="number";
 const r=run(f);assert.equal(r.checks.archivePathIsString,false);
 assert.equal(r.checks.buildRequiredFieldsMatch,false);assert.equal(r.reviewRequired,true);
});
test("missing settings archive query is review-required",()=>{
 const f=fixture();f.api.paths[E.settingsEndpoint].get.parameters=[];
 assert.equal(run(f).checks.settingsArchivePathRequired,false);
});
test("issue reopening is review-required",()=>{
 const f=fixture();f.issue.state="open";assert.equal(run(f).reviewRequired,true);
});
test("missing evidence fails closed",()=>{
 assert.throws(()=>evaluate({openapi:null,issue:{}}),/missing_or_invalid:openapi/);
 assert.throws(()=>evaluate({openapi:{},issue:null}),/missing_or_invalid:issue/);
});
