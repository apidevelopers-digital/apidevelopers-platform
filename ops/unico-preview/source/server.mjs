import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalog } from "./src/catalog.mjs";
import { createGatewayClient } from "./src/gateway-client.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const gateway = createGatewayClient();
const port = Number(process.env.PORT || 3000);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
function json(res, status, body) { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); }
async function readJson(req) { const chunks=[]; for await (const chunk of req) chunks.push(chunk); const raw=Buffer.concat(chunks).toString("utf8"); return raw?JSON.parse(raw):{}; }
async function serveStatic(req,res){ const path=req.url==="/"?"/index.html":req.url; const safe=path.split("?")[0].replace(/\.\./g,""); try{ const content=await readFile(join(publicDir,safe)); res.writeHead(200,{"content-type":mime[extname(safe)]||"application/octet-stream"}); res.end(content);}catch{ const fallback=await readFile(join(publicDir,"index.html")); res.writeHead(200,{"content-type":"text/html; charset=utf-8"}); res.end(fallback);} }
const server=http.createServer(async(req,res)=>{ try{
  if(req.method==="GET"&&req.url==="/health") return json(res,200,{ok:true,product:"uni-co-web"});
  if(req.method==="GET"&&req.url==="/api/catalog") return json(res,200,catalog);
  if(req.method==="GET"&&req.url==="/api/session") return json(res,200,{authenticated:false,state:"session_bootstrap_not_connected",cookieName:"__Host-apidevelopers-session"});
  if(req.method==="POST"&&req.url==="/api/session/login") return json(res,503,{ok:false,error:"session_bootstrap_not_connected"});
  if(req.method==="POST"&&req.url==="/api/web-agent/conversations"){ const payload=await readJson(req); const result=await gateway.createConversation({cookieHeader:String(req.headers.cookie||""),payload}); return json(res,result.status,result.body??{}); }
  return serveStatic(req,res);
}catch{return json(res,500,{ok:false,error:"internal_error"});}});
if(process.env.NODE_ENV!=="test"){ server.listen(port,()=>console.log(`uni-co-web listening on ${port}`)); }
export { server };
