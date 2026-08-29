import { createHash } from "node:crypto";

export const TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE = Object.freeze({
  version:"trust-face-deep-embedding/v1-lab",
  input:Object.freeze({width:112,height:112,channels:3,colorSpace:"RGB",aligned:true}),
  embeddingDim:512,normalizeEmbedding:true,backboneClass:"mobile-residual-cnn",
  lossFamily:"additive-angular-margin",qualityAwareTraining:true,
  productionReady:false,biometricClaimReady:false,trainedWeightsIncluded:false,
  livenessPad:false,openSetIdentification:false,verification1to1:true,
});

function fail(code,message){const e=new Error(message);e.name="TrustFaceDeepEmbeddingV1Error";e.code=code;throw e;}
function finite(v,f){if(!Number.isFinite(v))fail("invalid_number",`${f} must be finite`);return v;}
function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
function magnitude(v){if(!Array.isArray(v)||!v.length)fail("invalid_vector","vector must be non-empty");let s=0;for(const x of v){finite(x,"vector value");s+=x*x;}return Math.sqrt(s);}

export function normalizeDeepEmbedding(vector,expectedDim=512){
  if(!Array.isArray(vector)||vector.length!==expectedDim)fail("invalid_embedding_dimension",`embedding must contain exactly ${expectedDim} values`);
  const m=magnitude(vector);if(m<=1e-12)fail("zero_embedding","embedding magnitude must be greater than zero");
  return Object.freeze(vector.map(v=>v/m));
}
export function cosineFromNormalized(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length)fail("invalid_cosine_vectors","cosine vectors must have equal non-zero dimensions");
  let d=0;for(let i=0;i<a.length;i+=1)d+=finite(a[i],"a")*finite(b[i],"b");return clamp(d,-1,1);
}
export function arcFaceTargetCosine(cosine,marginRadians=0.5){
  finite(cosine,"cosine");finite(marginRadians,"marginRadians");
  if(marginRadians<0||marginRadians>=Math.PI/2)fail("invalid_angular_margin","marginRadians must be >= 0 and < pi/2");
  return Math.cos(Math.acos(clamp(cosine,-1,1))+marginRadians);
}
export function qualityAdaptiveAngularMargin({qualityZ,baseMargin=0.5,adaptationStrength=0.35,minMultiplier=0.65,maxMultiplier=1.35}={}){
  finite(qualityZ,"qualityZ");finite(baseMargin,"baseMargin");finite(adaptationStrength,"adaptationStrength");
  if(baseMargin<=0)fail("invalid_base_margin","baseMargin must be > 0");
  if(adaptationStrength<0||adaptationStrength>1)fail("invalid_adaptation_strength","adaptationStrength must be between 0 and 1");
  return baseMargin*clamp(1+clamp(qualityZ,-1,1)*adaptationStrength,minMultiplier,maxMultiplier);
}
export function createAngularMarginLogits({embedding,classWeights,targetIndex,scale=64,marginRadians=0.5,qualityZ=null,adaptationStrength=0.35}={}){
  const f=normalizeDeepEmbedding(embedding,embedding?.length??0);
  if(!Array.isArray(classWeights)||classWeights.length<2)fail("invalid_class_weights","classWeights must contain at least two class vectors");
  if(!Number.isInteger(targetIndex)||targetIndex<0||targetIndex>=classWeights.length)fail("invalid_target_index","targetIndex is outside classWeights");
  finite(scale,"scale");if(scale<=0)fail("invalid_scale","scale must be > 0");
  const m=qualityZ===null?marginRadians:qualityAdaptiveAngularMargin({qualityZ,baseMargin:marginRadians,adaptationStrength});
  const logits=classWeights.map((w,i)=>{const c=cosineFromNormalized(f,normalizeDeepEmbedding(w,f.length));return (i===targetIndex?arcFaceTargetCosine(c,m):c)*scale;});
  return Object.freeze({logits:Object.freeze(logits),targetIndex,scale,marginRadians,effectiveMargin:m,qualityAware:qualityZ!==null});
}

function stable(v){if(Array.isArray(v))return `[${v.map(stable).join(",")}]`;if(v&&typeof v==="object")return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;return JSON.stringify(v);}
const FORBIDDEN=new Set(["image","images","pixels","embedding","embeddings","template","templates","name","email","phone","cpf","rg","document"]);
function clean(v,p="evidence"){if(!v||typeof v!=="object")return;for(const[k,x]of Object.entries(v)){if(FORBIDDEN.has(k))fail("forbidden_biometric_or_pii_field",`${p}.${k} must not be persisted in model evidence`);clean(x,`${p}.${k}`);}}

export function createDeepEmbeddingModelManifest({modelId,modelVersion,architecture,training,calibration}={}){
  for(const[field,value]of Object.entries({modelId,modelVersion}))if(typeof value!=="string"||!value.trim())fail("invalid_model_manifest",`${field} is required`);
  if(!architecture||typeof architecture!=="object")fail("invalid_model_manifest","architecture is required");
  if(!training||typeof training!=="object")fail("invalid_model_manifest","training is required");
  if(typeof training.datasetManifestDigest!=="string"||!training.datasetManifestDigest.startsWith("sha256:"))fail("invalid_dataset_digest","training.datasetManifestDigest must be a sha256 digest");
  if(typeof training.codeCommit!=="string"||training.codeCommit.length<7)fail("invalid_training_commit","training.codeCommit is required");
  if(!Number.isInteger(training.seed))fail("invalid_training_seed","training.seed must be an integer");
  clean({architecture,training,calibration},"input");
  const manifest={
    profileVersion:TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.version,modelId:modelId.trim(),modelVersion:modelVersion.trim(),
    architecture:{inputWidth:architecture.inputWidth??112,inputHeight:architecture.inputHeight??112,channels:architecture.channels??3,embeddingDim:architecture.embeddingDim??512,backboneClass:architecture.backboneClass??"mobile-residual-cnn",parameters:architecture.parameters??null},
    training:{datasetManifestDigest:training.datasetManifestDigest,codeCommit:training.codeCommit,seed:training.seed,objective:training.objective??"additive-angular-margin",scale:training.scale??64,marginRadians:training.marginRadians??0.5,qualityAware:training.qualityAware===true,epochs:training.epochs??null},
    calibration:calibration?{datasetManifestDigest:calibration.datasetManifestDigest??null,targetFmr:calibration.targetFmr??null,threshold:calibration.threshold??null}:null,
    productionReady:false,biometricClaimReady:false,rawBiometricLogging:false,
  };
  clean(manifest);
  const digest=`sha256:${createHash("sha256").update(stable(manifest)).digest("hex")}`;
  return Object.freeze({...manifest,digest});
}

export function createOwnedBackboneArchitectureSpec(stageWidths=[64,96,160,256],stageDepths=[1,2,3,2],embeddingDim=512){
  if(!Array.isArray(stageWidths)||!Array.isArray(stageDepths)||!stageWidths.length||stageWidths.length!==stageDepths.length)fail("invalid_backbone_spec","stage widths/depths must be equal non-empty arrays");
  if(!Number.isInteger(embeddingDim)||embeddingDim<128||embeddingDim>2048)fail("invalid_embedding_dimension","embeddingDim must be between 128 and 2048");
  const stages=stageWidths.map((width,index)=>{const depth=stageDepths[index];if(!Number.isInteger(width)||width<8)fail("invalid_stage_width",`stageWidths[${index}] is invalid`);if(!Number.isInteger(depth)||depth<1)fail("invalid_stage_depth",`stageDepths[${index}] is invalid`);return Object.freeze({index,width,depth,block:"depthwise-separable-residual",downsampleAtEntry:index>0});});
  return Object.freeze({
    architectureVersion:"trust-face-mobile-residual/v1",input:TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.input,
    stem:Object.freeze({operator:"conv3x3",width:stageWidths[0],stride:2,activation:"prelu"}),
    stages:Object.freeze(stages),head:Object.freeze({operator:"global-depthwise-projection",embeddingDim,normalization:"l2"}),
    trainingObjective:Object.freeze({family:"additive-angular-margin",qualityAwareExtension:"feature-quality-adaptive-margin"}),
    trainedWeightsIncluded:false,productionReady:false,
  });
}
