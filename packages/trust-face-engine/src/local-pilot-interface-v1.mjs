export const LOCAL_PILOT_V1=Object.freeze({version:"trust-face-local-pilot-interface/v1",localOnly:true,githubActionsExecution:false,networkInput:false,synthetic:true,human:false,camera:false,benchmark:false,threshold:false,identity:false,production:false});
export function localPilotPlan({kind="synthetic",source="file",actions=false,execute=false}={}){
 if(!["synthetic","consented-human"].includes(kind))throw Object.assign(new Error("kind"),{code:"local_pilot_input_kind_invalid"});
 if(!["file","camera"].includes(source))throw Object.assign(new Error("source"),{code:"local_pilot_source_kind_invalid"});
 if(source==="camera"&&kind!=="consented-human")throw Object.assign(new Error("camera"),{code:"local_pilot_camera_requires_human_gate"});
 let block=null;
 if(execute&&actions)block="github_actions_execution_forbidden";
 else if(execute&&kind==="consented-human")block="consented_human_execution_requires_separate_gate";
 else if(execute&&source==="camera")block="camera_execution_requires_separate_gate";
 return Object.freeze({version:LOCAL_PILOT_V1.version,kind,source,localOnly:true,execute,allowed:!block,block,inputPathEmitted:false,fileNameEmitted:false,cropStored:false,embeddingStored:false,embeddingLogged:false,vectorExposed:false,benchmark:false,threshold:false,identity:false,production:false});
}
export function sanitizeLocalPilotStatus(s={}){
 for(const k of ["path","inputPath","fileName","rawImage","crop","embedding","vector","cosine","identity","person"])if(Object.hasOwn(s,k))throw Object.assign(new Error(k),{code:"local_pilot_sensitive_output"});
 for(const k of ["benchmark","threshold","identityClaimed","production"])if(s[k]===true)throw Object.assign(new Error(k),{code:"local_pilot_scope_violation"});
 return Object.freeze({version:"trust-face-local-pilot-interface-status/v1",localInterface:s.localInterface===true,kind:s.kind??null,source:s.source??null,completed:s.completed===true,syntheticOnly:s.syntheticOnly===true,faces:Number.isInteger(s.faces)?s.faces:null,landmarks:Number.isInteger(s.landmarks)?s.landmarks:null,alignment:s.alignment??null,dim:Number.isInteger(s.dim)?s.dim:null});
}
