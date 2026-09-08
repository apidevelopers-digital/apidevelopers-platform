export const JSON_HEADERS=Object.freeze({"content-type":"application/json; charset=utf-8"});
export const DEFAULT_ALLOWED_ORIGINS=Object.freeze([
 "https://preview-apidevelopers.apidevelopers.digital",
 "https://mitra.apidevelopers.digital",
 "http://127.0.0.1:5173",
 "http://localhost:5173",
]);
export class MitraProfessionalError extends Error{
 constructor(status,code,message){super(message);this.name="MitraProfessionalError";this.status=status;this.code=code}
}
export function text(value,max=8_000){if(value===null||value===undefined)return"";return String(value).replace(/\s+/g," ").trim().slice(0,max)}
export function requiredText(value,field,max=8_000){
 const raw=value===null||value===undefined?"":String(value).replace(/\s+/g," ").trim();
 if(!raw)throw new MitraProfessionalError(400,`${field}_required`,`${field} é obrigatório.`);
 if(raw.length>max)throw new MitraProfessionalError(400,`${field}_too_long`,`${field} excede o limite seguro.`);
 return raw;
}
export function parseJsonBody(body,max=40_000){
 if(body&&typeof body==="object"&&!Buffer.isBuffer(body)&&!Array.isArray(body))return body;
 if(typeof body!=="string"||!body.trim())throw new MitraProfessionalError(400,"request_body_required","Informe um objeto JSON.");
 if(body.length>max)throw new MitraProfessionalError(413,"request_body_too_large","O corpo excede o limite seguro.");
 try{const parsed=JSON.parse(body);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("invalid");return parsed}
 catch{throw new MitraProfessionalError(400,"invalid_json","O corpo deve ser um objeto JSON válido.")}
}
export function normalizeAllowedOrigins(value){
 if(Array.isArray(value))return new Set(value.map(x=>String(x).trim()).filter(Boolean));
 const raw=String(value??"").trim();if(!raw)return new Set(DEFAULT_ALLOWED_ORIGINS);
 return new Set(raw.split(",").map(x=>x.trim()).filter(Boolean));
}
export function normalizeHttpsBase(value,fallback,envName){
 const raw=String(value??fallback).trim().replace(/\/+$/,"");let url;
 try{url=new URL(raw)}catch{throw new TypeError(`${envName} must be a valid URL`)}
 const local=["localhost","127.0.0.1","::1"].includes(url.hostname);
 if(url.protocol!=="https:"&&!local)throw new TypeError(`${envName} must use HTTPS outside localhost`);
 return url.toString().replace(/\/+$/,"");
}
export function corsHeaders(origin,allowed,extra={}){
 const normalized=String(origin??"").trim(),base={...JSON_HEADERS,...extra,vary:"Origin"};
 return Object.freeze(normalized&&allowed.has(normalized)?{...base,"access-control-allow-origin":normalized}:base);
}
export function jsonResponse(status,payload,origin,allowed,extra={}){
 return{status,headers:corsHeaders(origin,allowed,extra),body:JSON.stringify(payload)};
}
export function ensureOrigin(origin,allowed){
 const normalized=String(origin??"").trim();if(!normalized)return;
 if(!allowed.has(normalized))throw new MitraProfessionalError(403,"origin_not_allowed","Origem não autorizada para a Mitra Profissional.");
}
export function clientKey(headers={}){
 const direct=text(headers["x-real-ip"]??headers["cf-connecting-ip"],120);if(direct)return direct;
 const forwarded=text(headers["x-forwarded-for"],500);if(forwarded)return forwarded.split(",")[0].trim().slice(0,120)||"anonymous";
 return"anonymous";
}
export function createRateLimiter({now,max,windowMs}){
 const buckets=new Map();return{consume(key){
  if(max<=0)return{allowed:true,resetAt:now()+windowMs};
  const current=now(),previous=buckets.get(key),bucket=!previous||current>=previous.resetAt?{count:0,resetAt:current+windowMs}:previous;
  if(bucket.count>=max){buckets.set(key,bucket);return{allowed:false,resetAt:bucket.resetAt}}
  bucket.count+=1;buckets.set(key,bucket);return{allowed:true,resetAt:bucket.resetAt};
 }};
}
export function safeFacts(value,maxItems=30){
 if(value===undefined||value===null||value==="")return[];
 if(!Array.isArray(value))throw new MitraProfessionalError(400,"facts_array_required","facts deve ser uma lista.");
 if(value.length>maxItems)throw new MitraProfessionalError(400,"facts_too_many","Há fatos demais para uma única análise.");
 return value.map(item=>{
  if(typeof item==="string")return requiredText(item,"fact",1_600);
  if(!item||typeof item!=="object"||Array.isArray(item))throw new MitraProfessionalError(400,"fact_invalid","Cada fato deve ser texto ou objeto simples.");
  if(JSON.stringify(item).length>4_000)throw new MitraProfessionalError(400,"fact_too_large","Um dos fatos excede o limite seguro.");
  return item;
 });
}
export function safeLimit(value,fallback=10,max=50){
 const numeric=Number(value??fallback);
 if(!Number.isInteger(numeric)||numeric<1||numeric>max)throw new MitraProfessionalError(400,"limit_invalid",`limit deve ficar entre 1 e ${max}.`);
 return numeric;
}
export function sanitize(value,depth=0){
 if(depth>8)return null;
 if(Array.isArray(value))return value.slice(0,100).map(x=>sanitize(x,depth+1));
 if(!value||typeof value!=="object"){if(typeof value==="string")return value.slice(0,12_000);return value}
 const blocked=/(^|_)(authorization|bearer|token|secret|cookie|password|api_?key|raw)(_|$)/i,out={};
 for(const [key,item]of Object.entries(value)){if(!blocked.test(key))out[key]=sanitize(item,depth+1)}
 return out;
}
