import { createHash } from "node:crypto";
export const TRUST_FACE_EXTERNAL_TRAINED_BACKBONE_ADMISSION_V1=Object.freeze({version:"trust-face-external-trained-backbone-admission/v1",mode:"lab-only",requiredEmbeddingDim:512,requiredAlignmentLandmarks:5,rawBiometricPayloadAccepted:false,modelWeightsStoredByReceipt:false,commercialUseAuthorizedByDefault:false,authenticationUseAuthorizedByDefault:false,independentValidationVerifiedByDefault:false,productionReadyByDefault:false,biometricClaimReadyByDefault:false});
export class TrustFaceExternalTrainedBackboneAdmissionV1Error extends Error{constructor(code,message){super(message);this.name="TrustFaceExternalTrainedBackboneAdmissionV1Error";this.code=code}}
const fail=(c,m)=>{throw new TrustFaceExternalTrainedBackboneAdmissionV1Error(c,m)};
const req=(v,f)=>{if(typeof v!=="string"||!v.trim())fail("invalid_admission_field",`${f} is required`);return v.trim()};
const dig=(v,f)=>{const x=req(v,f).toLowerCase();if(!/^sha256:[0-9a-f]{64}$/.test(x))fail("invalid_admission_digest",`${f} must be sha256:<64 hex>`);return x};
const stable=v=>Array.isArray(v)?`[${v.map(stable).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`:JSON.stringify(v);
const sha=v=>`sha256:${createHash("sha256").update(stable(v)).digest("hex")}`;
const LICENSES=new Set(["Apache-2.0","MIT","BSD-3-Clause"]);
const PROV=new Set(["unknown","partial","documented"]);
const VAL=new Set(["none","partial","verified"]);
export function createExternalTrainedBackboneAdmissionV1({modelId,modelFamily,artifactFormat,sourceRepository,sourcePath,sourceRevision,weightsDigest,licenseSpdx,licenseEvidenceRef,trainingDataProvenanceStatus="unknown",commercialUseClarified=false,authenticationUseClarified=false,independentValidationStatus="none",evaluationDigest=null,embeddingDim=512,alignmentLandmarks=5,sourceIntegrityVerified=false}={}){
 const id=req(modelId,"modelId"),family=req(modelFamily,"modelFamily"),format=req(artifactFormat,"artifactFormat").toLowerCase();
 if(format!=="onnx")fail("unsupported_artifact_format","artifactFormat must be onnx");
 const repo=req(sourceRepository,"sourceRepository"),path=req(sourcePath,"sourcePath"),revision=req(sourceRevision,"sourceRevision"),wd=dig(weightsDigest,"weightsDigest"),license=req(licenseSpdx,"licenseSpdx"),licenseRef=req(licenseEvidenceRef,"licenseEvidenceRef");
 if(!LICENSES.has(license))fail("unsupported_model_license","licenseSpdx is not in the admitted lab allowlist");
 if(!PROV.has(trainingDataProvenanceStatus))fail("invalid_training_data_provenance_status","unsupported trainingDataProvenanceStatus");
 if(!VAL.has(independentValidationStatus))fail("invalid_independent_validation_status","unsupported independentValidationStatus");
 if(embeddingDim!==512)fail("invalid_embedding_dim","embeddingDim must be 512");
 if(alignmentLandmarks!==5)fail("invalid_alignment_landmarks","alignmentLandmarks must be 5");
 const ed=evaluationDigest==null?null:dig(evaluationDigest,"evaluationDigest");
 const lab=sourceIntegrityVerified===true;
 const product=lab&&trainingDataProvenanceStatus==="documented"&&commercialUseClarified===true&&authenticationUseClarified===true&&independentValidationStatus==="verified"&&Boolean(ed);
 const body=Object.freeze({version:TRUST_FACE_EXTERNAL_TRAINED_BACKBONE_ADMISSION_V1.version,mode:"lab-only",modelId:id,modelFamily:family,artifactFormat:"onnx",sourceRepository:repo,sourcePath:path,sourceRevision:revision,weightsDigest:wd,licenseSpdx:license,licenseEvidenceRef:licenseRef,trainingDataProvenanceStatus,commercialUseClarified:commercialUseClarified===true,authenticationUseClarified:authenticationUseClarified===true,independentValidationStatus,evaluationDigest:ed,embeddingDim:512,alignmentLandmarks:5,sourceIntegrityVerified:sourceIntegrityVerified===true,externallyTrainedWeightsPresent:true,labInferenceEligible:lab,productUseEligible:product,rawBiometricPayloadAccepted:false,modelWeightsStoredByReceipt:false,providerAuthenticityVerified:false,productionAuthorized:false,productionReady:false,biometricClaimReady:false});
 return Object.freeze({...body,admissionDigest:sha(body)});
}
