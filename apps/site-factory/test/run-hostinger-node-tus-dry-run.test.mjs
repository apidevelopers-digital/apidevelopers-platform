import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { currentOpenApiFixture } from "./fixtures/hostinger-node-build-openapi.mjs";
const cli = fileURLToPath(new URL("../src/run-hostinger-node-tus-dry-run.mjs", import.meta.url));
test("offline TUS CLI completes only mocked dry-run and rejects unsafe inputs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "node-tus-"));
  try {
    const zip = path.join(dir, "archive.zip"), json = path.join(dir, "input.json");
    const bytes = Buffer.from([80,75,3,4,1,2,3,4]);
    fs.writeFileSync(zip, bytes);
    const input = {
      openapi: currentOpenApiFixture(), issue: {number:56,state:"open"},
      observedAt:"2026-10-26T00:00:00Z",
      username:"dryrun",domain:"example.test",archivePath:"artifacts/app.zip",
      startBuildInput:{
        node_version:22,app_type:"vite",root_directory:null,output_directory:"dist",
        build_script:"build",source_type:"archive",
        source_options:{archive_path:"artifacts/app.zip"}
      },
      chunkSize:4,responses:[{status:204,offset:4},{status:204,offset:8}],
      archiveSha256:createHash("sha256").update(bytes).digest("hex")
    };
    const run = (value) => {
      fs.writeFileSync(json, JSON.stringify(value));
      return spawnSync(process.execPath, [cli,"--input",json,"--archive",zip],{encoding:"utf8"});
    };
    const ok = run(input);
    assert.equal(ok.status,0,ok.stderr);
    const result = JSON.parse(ok.stdout);
    assert.equal(result.tus.complete,true);
    assert.equal(result.archive.sha256,input.archiveSha256);
    assert.equal(result.buildArchivePath,input.archivePath);
    assert.deepEqual(result.barriers,{
      writesEnabled:false,buildStartAllowed:false,
      remoteBuildStarted:false,productionExecutionAllowed:false
    });
    for (const bad of [
      {...input,archiveSha256:"0".repeat(64)},
      {...input,productionExecutionAllowed:true},
      {...input,openapi:{paths:{}}}
    ]) {
      const blocked=run(bad);
      assert.equal(blocked.status,1);
      assert.equal(blocked.stdout,"");
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
