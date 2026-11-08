import test from "node:test";
import assert from "node:assert/strict";
import { planHostingerNodeArchiveUpload as plan } from "../src/hostinger-node-tus-plan.mjs";
const t = {username:"demo",domain:"demo.test",archivePath:"a.zip"};
const b = () => ({node_version:22,app_type:"vite",root_directory:null,output_directory:null,build_script:null,source_type:"archive",source_options:{archive_path:"a.zip"}});
test("validated dry-run remains blocked",()=>{
  const p=plan({...t,startBuildInput:b()});
  assert.deepEqual(p.buildRequest.body,b());
  assert.equal(p.buildPayloadValidated,true);
  assert.equal(p.writesEnabled,false);
  assert.equal(p.buildStartAllowed,false);
});
test("reject mismatched archive and preserve legacy preview",()=>{
  assert.equal(plan(t).buildPayloadValidated,false);
  assert.equal(Object.hasOwn(plan(t).buildRequest,"body"),false);
  assert.throws(()=>plan({...t,startBuildInput:{...b(),source_options:{archive_path:"b.zip"}}}),/archive_path_mismatch/);
});
