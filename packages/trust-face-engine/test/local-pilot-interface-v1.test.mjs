import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {LOCAL_PILOT_V1,localPilotPlan,sanitizeLocalPilotStatus} from "../src/local-pilot-interface-v1.mjs";

const script=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../scripts/run-local-pilot-interface-v1.sh");

test("contract is local-only and human/camera locked",()=>{
 assert.equal(LOCAL_PILOT_V1.localOnly,true);
 assert.equal(LOCAL_PILOT_V1.githubActionsExecution,false);
 assert.equal(LOCAL_PILOT_V1.networkInput,false);
 assert.equal(LOCAL_PILOT_V1.synthetic,true);
 assert.equal(LOCAL_PILOT_V1.human,false);
 assert.equal(LOCAL_PILOT_V1.camera,false);
});

test("plan allows synthetic local and blocks Actions/human",()=>{
 const local=localPilotPlan({execute:true});
 assert.equal(local.allowed,true);
 assert.equal(local.inputPathEmitted,false);
 assert.equal(local.embeddingStored,false);
 const actions=localPilotPlan({actions:true,execute:true});
 assert.equal(actions.allowed,false);
 assert.equal(actions.block,"github_actions_execution_forbidden");
 const human=localPilotPlan({kind:"consented-human",execute:true});
 assert.equal(human.allowed,false);
 assert.equal(human.block,"consented_human_execution_requires_separate_gate");
});

test("camera requires consented-human gate",()=>{
 assert.throws(()=>localPilotPlan({kind:"synthetic",source:"camera"}),e=>e?.code==="local_pilot_camera_requires_human_gate");
});

test("status sanitizer rejects sensitive fields and claims",()=>{
 const clean=sanitizeLocalPilotStatus({localInterface:true,kind:"synthetic",source:"file",completed:true,syntheticOnly:true,faces:1,landmarks:5,alignment:"112x112",dim:512});
 assert.equal(clean.dim,512);
 assert.throws(()=>sanitizeLocalPilotStatus({embedding:[1,2]}),e=>e?.code==="local_pilot_status_sensitive_field_forbidden");
 assert.throws(()=>sanitizeLocalPilotStatus({identityClaimed:true}),e=>e?.code==="local_pilot_scope_violation");
});

test("launcher plan-only is sanitized",()=>{
 execFileSync("bash",["-n",script],{stdio:"pipe"});
 const output=execFileSync("bash",[script,"--input-kind","synthetic","--source","file","--image","/private/local/synthetic-face.jpg","--yunet","/private/local/yunet.onnx","--auraface","/private/local/auraface.onnx","--plan-only"],{encoding:"utf8",env:{...process.env,GITHUB_ACTIONS:"false"}});
 const plan=JSON.parse(output);
 assert.equal(plan.localOnly,true);
 assert.equal(plan.executionPerformed,ifalse);
 assert.equal(plan.githubActionsTransportAllowed,false);
 assert.equal(plan.inputPathEmitted,false);
 assert.equal(output.includes("/private/local/synthetic-face.jpg"),false);
 assert.equal(output.includes("yunet.onnx"),false);
 assert.equal(output.includes("auraface.onnx"),false);
});

test("launcher blocks human before file access",()=>{
 const r=spawnSync("bash",[script,"--input-kind","consented-human","--source","file","--image","/must/not/read.jpg","--yunet","/must/not/read-yunet.onnx","--auraface","/must/not/read-auraface.onnx"],{encoding:"utf8",env:{...process.env,GITHUB_ACTIONS:"false"}});
 assert.equal(r.status,43);
 assert.match(r.stderr,/consented_human_execution_requires_separate_gate/);
 assert.equal(r.stderr.includes("/must/not/read.jpg"),false);
});
