import{createPreviewAccountAccessContextResolver,UNI_ACCOUNT_PREVIEW_PRODUCT_ID}from"./account-access-context-preview.mjs";
import{createAccountAccessContextHttpApp,accountAccessContextResolvePath}from"./account-access-context-http.mjs";
export function createUniAccountPreviewAccessContextComposition({app,persistenceStore,consumerAuthenticator,consumerPrincipalId,enabled=false,clock}={}){
 if(typeof app?.handleRequest!=="function")throw new TypeError("app.handleRequest is required");
 if(enabled!==true)return Object.freeze({enabled:false,app,descriptor:Object.freeze({mode:"preview-only",productionEnabled:false,runtimeAutoWiring:false,productId:UNI_ACCOUNT_PREVIEW_PRODUCT_ID})});
 if(!persistenceStore||typeof persistenceStore.read!=="function"||typeof persistenceStore.transaction!=="function"||typeof persistenceStore.executeIdempotent!=="function")throw new TypeError("persistenceStore is required");
 if(typeof consumerAuthenticator?.authenticate!=="function")throw new TypeError("consumerAuthenticator.authenticate is required");
 if(typeof consumerPrincipalId!=="string"||!consumerPrincipalId.trim())throw new TypeError("consumerPrincipalId is required");
 const resolver=createPreviewAccountAccessContextResolver({store:persistenceStore,...(clock?{clock}:{})});
 const http=createAccountAccessContextHttpApp({app,resolver,consumerAuthenticator,consumerPrincipalId});
 if(http.enabled!==true)throw new TypeError("preview access context HTTP composition is unavailable");
 return Object.freeze({enabled:true,app:http.app,resolver,descriptor:Object.freeze({mode:"preview-only",path:accountAccessContextResolvePath,productId:UNI_ACCOUNT_PREVIEW_PRODUCT_ID,productionEnabled:false,runtimeAutoWiring:false,consumerServerAuthenticationRequired:true,trustEvidenceRequired:true})});
}