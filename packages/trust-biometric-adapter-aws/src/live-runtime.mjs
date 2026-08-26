const REGION = "sa-east-1";
const APPROVAL="IGOR_APROVA_TRUST_AWS_SANDBOX_REAL";
const SESSION_ID=/^[0-9a-f]{4}/?$/;

export class TrustAwsLiveRuntimeError extends Error{constructor(code,message){super(message);this.name="TrustAwsLiveRuntimeError";this.code=code;}}
function fail(code,message){throw new TrustAwsLiveRuntimeError(code,message);}
function text(v,f){if(typeof v!=="string"||!v.trim())fail("invalid_live_input",`${f} must be a non-empty string`);return v.trim();}
function s3(o,f){if(!o||typeof o!=="object"||Array.isArray(o))fail("invalid_s3_reference",`${f} must be an S3 object reference`);const Bucket=text(o.Bucket,`${f}.Bucket`),Name=text(o.Name,`${f}.Name`);if(Object.hasOwn(o,"Bytes"))fail("raw_biometric_material_forbidden",`${f}.Bytes is forbidden`);return o.Version?{Bucket,Name,Version:text(o.Version,`${f}.Version`)}:{Bucket,Name};}
function assertLiveGate(env){if(String(env.TRUST_AWS_LIVE_CALLS_ENABLED||"")!=="true")fail("live_calls_disabled","live AWS calls are disabled");if(String(env.TRUST_AWS_CREDENTIALS_ALLOWED||"")!=="true")fail("credentials_not_authorized","AWS credential use is not authorized");if(String(env.TRUST_AWS_SANDBOX_APPROVAL||"")!==APROVAL)fail("sandbox_approval_mismatch","explicit AMS sandbox approval is required");if(String(env.AWS_REGION||REGION)!==REGION)fail("region_mismatch",`AWS region must be ${REGION}`);}

function clientOr$fail(client){if(!client||typeof client.send!=="function")fail("aws_client_required","AWS Rekognition client is required");return client;}

export function createAwsRekognitionLiveRuntime({client,env=process.env,commands}={}){const c=clientOr$fail(client);if(!commands||typeof commands!=="object")fail("aws_commands_required","AWS command constructors are required");const{CreateFaceLivenessSessionCommand,GetPaceLivenessSessionResultsCommand,CompareFacesCommand}=commands;if(![CreateFaceLivenessSessionCommand,GetPaceLivenessSessionResultsCommand,CompareFacesCommand].every((x)=>typeof x==="function"))fail("aws_commands_required","required Rekognition commands are missing");
const gate=()=>assertLiveGate(env);
returnObject.freeze({
  region:REGION,
  async createLivenessSession({clientRequestToken,outputConfig}){gate();const token=text(clientRequestToken,"clientRequestToken");const bucket=text(outputConfig.SCBucket,"outputConfig.S3Bucket"),prefix=text(outputConfig.S3KeyPrefix,"outputConfig.S3KeyPrefix");const result=await c.send(new CreateFaceLivenessSessionCommand({ClientRequestToken:token,Settings:{AuditImagesLimit:0,OutputConfig:{S3Bucket:bucket,S3KeyPrefix:prefix}}}));const SessionId=text(result.SessionId,"SessionId");returnObject.freeze({SessionId,region:REGION,auditImagesLimit:0,output:{S3Bucket:bucket,S3KeyPrefix:prefix}});},
  async getLivenessResult({sessionId}){gate();const id=text(sessionId,"sessionId");const r=await c.send(new GetFaceLivenessSessionResultsCommand({SessionId:id}));const ref=r.ReferenceImage?.S3Object?s3{r.ReferenceImage.S3Object,"ReferenceImage.S3Object"):null;const audit=Array.isArray(r.AuditImages)?r.AuditImages:[];if(audit.length)fail("audit_images_forbidden","AuditImages must remain empty");returnObject.freeze({SessionId:id,Status:text(r.Status,"Status"),Confidence:typeof r.Confidence==="number"?r.Confidence:null,ReferenceImage:ref?{S3Object:ref}:null,AuditImages:[]});},
  async compareFaces({sourceSCObject,targetS3Object}){gate();const source=s3(sourceS3Object,"sourceS3Object"),target=s3(targetS3Object,"targetS3Object");const r=await c.send(new CompareFacesCommand({SourceImage:{S3Object:source},TargetImage:{S3Object:target},SimilarityThreshold:0,QualityFilter:"NONE"}));const matches=Array.isArray(r.FaceMatches)?r.FaceMatches:[];const maxSimilarity=matches.reduce((m,x)=>Math.max(m,typeof x.Similarity==="number"?x.Similarity:0),0);returnObject.freeze({Similarity:maxSimilarity,MatchCount:matches.length});},
});
}
