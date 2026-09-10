#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PARENT="apidevelopers.digital";
const PUBLIC="mitra-preview.apidevelopers.digital";
const PREFIX="mitra-preview";
const PHRASE="IGOR_APROVA_MITRA_PREVIEW_DEPLOY";

function arg(name, fallback="") {
  const i=process.argv.indexOf(`--${name}`);
  return i>=0 ? (process.argv[i+1]||"") : fallback;
}
function mcpBin() {
  const here=path.dirname(fileURLToPath(import.meta.url));
  return path.join(here,"node_modules",".bin",process.platform==="win32"?"hostinger-hosting-mcp.cmd":"hostinger-hosting-mcp");
}
async function walk(root, rel="") {
  const out=[];
  for (const e of await fs.readdir(root,{withFileTypes:true})) {
    const abs=path.join(root,e.name), r=rel?`${rel}/${e.name}`:e.name;
    if (e.isSymbolicLink()) throw new Error(`symlink_not_allowed:${r}`);
    if (e.isDirectory()) out.push(...await walk(abs,r));
    else if (e.isFile()) out.push({abs,rel:r});
  }
  return out;
}
function maybeJson(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}
function findCreds(value, depth=0, seen=new Set()) {
  if (value == null || depth > 10) return null;
  if (typeof value === "string") {
    const parsed=maybeJson(value);
    if (parsed !== value) return findCreds(parsed, depth+1, seen);
    return null;
  }
  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (value.url && value.auth_key && value.rest_auth_key) {
    return {url:String(value.url), a:String(value.auth_key), r:String(value.rest_auth_key)};
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit=findCreds(item, depth+1, seen);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key,item] of Object.entries(value)) {
    if (key === "auth_key" || key === "rest_auth_key") continue;
    const hit=findCreds(item, depth+1, seen);
    if (hit) return hit;
  }
  return null;
}
async function upload(c,local,remote){
  const b=await fs.readFile(local);
  const url=`${c.url.replace(/\/+$/,"")}/${remote.split("/").map(encodeURIComponent).join("/")}?override=true`;
  const h={"X-Auth":c.a,"X-Auth-Rest":c.r,"Tus-Resumable":"1.0.0"};
  let res=await fetch(url,{method:"POST",headers:{...h,"Upload-Length":String(b.length),"Upload-Offset":"0"}});
  if(res.status!==201) throw new Error(`tus_create_failed:${remote}:${res.status}`);
  res=await fetch(url,{method:"PATCH",headers:{...h,"Content-Type":"application/offset+octet-stream","Upload-Offset":"0"},body:b});
  if(res.status!==204) throw new Error(`tus_patch_failed:${remote}:${res.status}`);
}
async function probe(){
  for(let n=1;n<=12;n++){
    try{
      const r=await fetch(`https://${PUBLIC}/?probe=${Date.now()}`,{cache:"no-store"});
      const t=await r.text();
      if(r.ok && /Mitra/i.test(t)) return {ok:true,status:r.status};
    }catch{}
    await new Promise(r=>setTimeout(r,5000));
  }
  return {ok:false};
}
async function main(){
  const mode=arg("mode","preflight"), dist=path.resolve(arg("dist"));
  const evidence=path.resolve(arg("evidence","mitra-preview-evidence.json"));
  if(!["preflight","apply"].includes(mode)) throw new Error("bad_mode");
  if(!dist || !fsSync.existsSync(dist)) throw new Error("dist_missing");
  const files=await walk(dist);
  if(!files.some(f=>f.rel==="index.html")) throw new Error("index_missing");
  const html=await fs.readFile(path.join(dist,"index.html"),"utf8");
  if(!/Mitra/i.test(html)) throw new Error("mitra_marker_missing");
  const ev={mode,target:{parent:PARENT,public:PUBLIC,prefix:PREFIX},fileCount:files.length,writeExecuted:false,status:"ready"};
  if(mode==="preflight"){
    await fs.writeFile(evidence,JSON.stringify(ev,null,2));
    console.log(JSON.stringify(ev)); return;
  }

  const token=process.env.HOSTINGER_API_TOKEN||"";
  if(!token) throw new Error("hostinger_token_missing");
  if(arg("approved-sha")!==process.env.GITHUB_SHA) throw new Error("approved_sha_mismatch");
  if(arg("approval")!==PHRASE) throw new Error("approval_phrase_mismatch");
  const bin=mcpBin();
  if(!fsSync.existsSync(bin)) throw new Error("mcp_binary_missing");

  let client;
  try{
    client=new Client({name:"mitra-preview-uploader",version:"1.0.1"},{capabilities:{}});
    await client.connect(new StdioClientTransport({command:bin,args:[],env:{...process.env,APITOKEN:token,DEBUG:"false"},stderr:"pipe"}));
    const listed=await client.listTools();
    const tool=listed.tools.find(t=>/generateUploadURL/i.test(t.name)&&(t.name.startsWith("hosting_")||t.name.startsWith("hostinger_")));
    if(!tool) throw new Error("generate_upload_url_tool_missing");
    const props=tool.inputSchema?.properties||{}, args={};
    if("domain" in props) args.domain=PARENT;
    if("username" in props) args.username=process.env.TARGET_HOSTINGER_USERNAME||"";
    const result=await client.callTool({name:tool.name,arguments:args});
    if(result?.isError) throw new Error("generate_upload_url_failed");
    const c=findCreds(result);
    if(!c) {
      const topKeys=result && typeof result==="object" ? Object.keys(result).sort().join(",") : typeof result;
      throw new Error(`upload_credentials_missing:shape=${topKeys}`);
    }
    const ordered=[...files].sort((a,b)=>a.rel==="index.html"?1:b.rel==="index.html"?-1:a.rel.localeCompare(b.rel));
    for(const f of ordered) await upload(c,f.abs,`${PREFIX}/${f.rel}`);
    ev.writeExecuted=true;
    ev.probe=await probe();
    if(!ev.probe.ok) throw new Error("public_probe_failed");
    ev.status="completed_and_public";
    await fs.writeFile(evidence,JSON.stringify(ev,null,2));
    console.log(JSON.stringify(ev));
  }catch(e){
    ev.status="error";
    ev.error=e?.message||String(e);
    await fs.writeFile(evidence,JSON.stringify(ev,null,2));
    console.error(JSON.stringify(ev));
    process.exitCode=1;
  }finally{ if(client) try{await client.close()}catch{} }
}
await main();
