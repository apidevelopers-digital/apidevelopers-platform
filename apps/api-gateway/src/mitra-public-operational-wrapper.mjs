import{createMitraPublicResearchFacade}from"./mitra-public-research.mjs";
import{createMitraPublicCamaraFetchAdapter}from"./mitra-public-camara-upstream.mjs";
import{createMitraProfessionalFacade}from"./mitra-embedded-professional-facade.mjs";

function numericEnv(env,name,fallback){
 const raw=String(env?.[name]??"").trim();if(!raw)return fallback;
 const value=Number(raw);return Number.isFinite(value)?value:fallback;
}

export function createMitraPublicOperationalWrapper({
 app,env=process.env,facadeFactory=createMitraPublicResearchFacade,
 camaraAdapterFactory=createMitraPublicCamaraFetchAdapter,
 professionalFactory=createMitraProfessionalFacade,
 fetchImpl=globalThis.fetch,
}={}){
 if(typeof app?.handleRequest!=="function")throw new TypeError("app.handleRequest must be a function");
 if(typeof facadeFactory!=="function")throw new TypeError("facadeFactory must be a function");
 if(typeof camaraAdapterFactory!=="function")throw new TypeError("camaraAdapterFactory must be a function");
 if(typeof professionalFactory!=="function")throw new TypeError("professionalFactory must be a function");

 const explicit=String(env.MITRA_PUBLIC_RESEARCH_UPSTREAM_BASE_URL??"").trim();
 let provider="external_https",baseUrl=explicit,bearer=env.MITRA_PUBLIC_RESEARCH_UPSTREAM_BEARER,researchFetch=fetchImpl;
 if(!explicit){
  const camara=camaraAdapterFactory({fetchImpl,baseUrl:env.MITRA_PUBLIC_RESEARCH_CAMARA_BASE_URL});
  if(!camara||typeof camara.fetch!=="function"||!camara.baseUrl)throw new TypeError("Câmara adapter must expose baseUrl and fetch");
  provider=camara.provider??"camara_dados_abertos";baseUrl=camara.baseUrl;bearer="";researchFetch=camara.fetch;
 }
 const publicResearch=facadeFactory({
  upstreamBaseUrl:baseUrl,upstreamBearer:bearer,
  allowedOrigins:env.MITRA_PUBLIC_RESEARCH_ALLOWED_ORIGINS,fetchImpl:researchFetch,
  timeoutMs:numericEnv(env,"MITRA_PUBLIC_RESEARCH_TIMEOUT_MS",12_000),
  rateLimitMax:numericEnv(env,"MITRA_PUBLIC_RESEARCH_RATE_LIMIT_MAX",30),
  rateLimitWindowMs:numericEnv(env,"MITRA_PUBLIC_RESEARCH_RATE_LIMIT_WINDOW_MS",60_000),
 });
 const professional=professionalFactory({
  upstreamBaseUrl:env.MITRA_PROFESSIONAL_ORCHESTRATOR_BASE_URL,
  upstreamBearer:env.MITRA_PROFESSIONAL_ORCHESTRATOR_BEARER,
  allowedOrigins:env.MITRA_PROFESSIONAL_ALLOWED_ORIGINS??env.MITRA_PUBLIC_RESEARCH_ALLOWED_ORIGINS,
  fetchImpl,
  timeoutMs:numericEnv(env,"MITRA_PROFESSIONAL_TIMEOUT_MS",18_000),
  rateLimitMax:numericEnv(env,"MITRA_PROFESSIONAL_RATE_LIMIT_MAX",20),
  rateLimitWindowMs:numericEnv(env,"MITRA_PROFESSIONAL_RATE_LIMIT_WINDOW_MS",60_000),
 });
 if(typeof publicResearch?.handleRequest!=="function")throw new TypeError("Mitra public research facade must expose handleRequest");
 if(typeof professional?.handleRequest!=="function")throw new TypeError("Mitra professional facade must expose handleRequest");

 const wrappedApp=Object.freeze({
  async handleRequest(request={}){
   const publicResult=await publicResearch.handleRequest(request);if(publicResult)return publicResult;
   const professionalResult=await professional.handleRequest(request);if(professionalResult)return professionalResult;
   return app.handleRequest(request);
  },
 });

 return Object.freeze({
  app:wrappedApp,
  descriptor:Object.freeze({
   enabled:true,configured:publicResearch.configured===true,provider,
   routes:Object.freeze(["GET /v1/mitra/public/health","OPTIONS /v1/mitra/public/search","POST /v1/mitra/public/search"]),
   writeExecuted:false,
  }),
  professionalDescriptor:Object.freeze({
   enabled:true,configured:professional.configured===true,
   routes:Object.freeze([
    "GET /v1/mitra/professional/health",
    "POST /v1/mitra/professional/analyze",
    "POST /v1/mitra/professional/jurimetrics",
    "POST /v1/mitra/professional/veritas",
    "POST /v1/mitra/professional/document/preview",
   ]),
   persistence:false,officeDatabaseAccess:false,writeExecuted:false,
  }),
 });
}

export function attachMitraPublicResearchToGateway({
 gateway,env=process.env,facadeFactory=createMitraPublicResearchFacade,
 camaraAdapterFactory=createMitraPublicCamaraFetchAdapter,
 professionalFactory=createMitraProfessionalFacade,fetchImpl=globalThis.fetch,
}={}){
 if(!gateway||typeof gateway!=="object")throw new TypeError("gateway is required");
 const wrapped=createMitraPublicOperationalWrapper({
  app:gateway.app,env,facadeFactory,camaraAdapterFactory,professionalFactory,fetchImpl,
 });
 return Object.freeze({...gateway,app:wrapped.app,mitraPublicResearch:wrapped.descriptor,mitraProfessional:wrapped.professionalDescriptor});
}
