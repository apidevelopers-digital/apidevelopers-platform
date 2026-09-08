const TIMEOUT=18000;
export class ProfessionalClientError extends Error{constructor(code,message,status=0){super(message);this.code=code;this.status=status}}
function clean(value){const raw=String(value||"").trim().replace(/\/+$/,"");if(!raw)return"";let url;try{url=new URL(raw)}catch{throw new ProfessionalClientError("invalid_base_url","Endpoint inválido.")}const local=["localhost","127.0.0.1"].includes(url.hostname);if(url.protocol!=="https:"&&!local)throw new ProfessionalClientError("insecure_base_url","A Mitra exige HTTPS.");return url.toString().replace(/\/+$/,"")}
export function createProfessionalClient({baseUrl="",fetchImpl=globalThis.fetch,timeoutMs=TIMEOUT}={}){
 const root=clean(baseUrl);
 async function call(path,body,method="POST"){
  if(!root)throw new ProfessionalClientError("not_configured","Mitra Profissional ainda não conectada.",503);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetchImpl(`${root}${path}`,{method,headers:{accept:"application/json",...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,credentials:"omit",cache:"no-store",redirect:"error"});
   let data={};try{data=await response.json()}catch{}
   if(!response.ok)throw new ProfessionalClientError(data.error||"request_failed",data.message||"Operação indisponível.",response.status);
   return data;
  }catch(error){if(error instanceof ProfessionalClientError)throw error;if(error?.name==="AbortError")throw new ProfessionalClientError("timeout","A operação excedeu o tempo permitido.",504);throw new ProfessionalClientError("network_error","Não foi possível alcançar a Mitra.",503)}
  finally{clearTimeout(timer)}
 }
 return Object.freeze({
  configured:Boolean(root),baseUrl:root,
  health:()=>call("/v1/mitra/professional/health",undefined,"GET"),
  analyze:(body)=>call("/v1/mitra/professional/analyze",body),
  jurimetrics:(body)=>call("/v1/mitra/professional/jurimetrics",body),
  veritas:(body)=>call("/v1/mitra/professional/veritas",body),
  documentPreview:(body)=>call("/v1/mitra/professional/document/preview",body),
 });
}
