#!/usr/bin/env python3
import argparse,hashlib,json,math,os,sys
import cv2,numpy as np

AB=260694151
AS="a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60"
YB=232589
YS="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
T=np.array([[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]],np.float32)

def fail(code,msg):
    print(json.dumps({"error":code,"message":msg},separators=(",",":")),file=sys.stderr);raise SystemExit(2)

def digest(p):
    h=hashlib.sha256()
    with open(p,"rb") as f:
        for c in iter(lambda:f.read(1048576),b""): h.update(c)
    return h.hexdigest()

def verify(p,n,h,label):
    if not os.path.isfile(p): fail(label+"_missing",label+" missing")
    if os.path.getsize(p)!=n: fail(label+"_size_mismatch",label+" size mismatch")
    if digest(p)!=h: fail(label+"_sha256_mismatch",label+" digest mismatch")

def detector(p):
    if hasattr(cv2,"FaceDetectorYN_create"):
        return cv2.FaceDetectorYN_create(p,"",(320,320),.70,.30,5000)
    return cv2.FaceDetectorYN.create(p,"",(320,320),.70,.30,5000)

def pose(v):
    v=np.asarray(v,np.float64).reshape(-1)
    if v.size<14 or not np.isfinite(v[:14]).all() or v[2]<=0:return False,"invalid_pose_geometry"
    re=(v[4],v[5]);le=(v[6],v[7]);no=(v[8],v[9])
    dx=le[0]-re[0];dy=le[1]-re[1];span=math.hypot(dx,dy)
    if not math.isfinite(span) or span<=sys.float_info.epsilon:return False,"invalid_pose_landmarks"
    if abs(no[0]-(le[0]+re[0])/2)/span>.30:return False,"pose_yaw_out_of_lab_range"
    if abs(dy)/span>.25:return False,"pose_roll_out_of_lab_range"
    if span/v[2]<.35:return False,"pose_eye_span_too_small"
    return True,None

def sim(src,dst):
    src=np.asarray(src,np.float64);dst=np.asarray(dst,np.float64)
    sm=src.mean(0);dm=dst.mean(0);sc=src-sm;dc=dst-dm
    var=np.mean(np.sum(sc*sc,1))
    if not math.isfinite(float(var)) or var<=np.finfo(np.float64).eps:fail("alignment_degenerate","degenerate landmarks")
    cov=(dc.T@sc)/src.shape[0];u,s,vt=np.linalg.svd(cov);sg=np.ones(2)
    if np.linalg.det(u)*np.linalg.det(vt)<0:sg[-1]=-1
    r=u@np.diag(sg)@vt;k=float(np.sum(s*sg)/var);tr=dm-k*(r@sm)
    m=np.zeros((2,3),np.float64);m[:,:2]=k*r;m[:,2]=tr
    if not np.isfinite(m).all():fail("alignment_non_finite","non-finite alignment")
    return m.astype(np.float32)

def main():
    ap=argparse.ArgumentParser()
    for x in ("sample","auraface_model","yunet_model","output"):
        ap.add_argument("--"+x.replace("_","-"),dest=x,required=True)
    a=ap.parse_args()
    verify(a.auraface_model,AB,AS,"auraface");verify(a.yunet_model,YB,YS,"yunet")
    if not os.path.isfile(a.sample) or os.path.islink(a.sample):fail("authorized_sample_invalid","sample must be a regular non-symlink file")
    z=os.path.getsize(a.sample)
    if z<=0 or z>50000000:fail("authorized_sample_size_out_of_range","sample size outside lab range")
    img=cv2.imread(a.sample,cv2.IMREAD_COLOR)
    if img is None or img.size==0 or img.ndim!=3 or img.shape[2]!=3:fail("authorized_sample_decode_failed","sample decode failed")
    d=detector(a.yunet_model);h,w=img.shape[:2];d.setInputSize((int(w),int(h)));o=d.detect(img)
    f=o[1] if isinstance(o,tuple) else o
    if f is None:fail("face_count_not_one","exactly one face required")
    f=np.asarray(f,np.float32)
    if f.ndim==1:f=f.reshape(1,-1)
    if f.ndim!=2 or f.shape[1]!=15 or not np.isfinite(f).all():fail("yunet_output_invalid","invalid YuNet output")
    if f.shape[0]!=1:fail("face_count_not_one","exactly one face required")
    ok,reason=pose(f[0])
    if not ok:fail("pose_gate_rejected",reason)
    lm=np.asarray(f[0][4:14],np.float32).reshape(5,2)
    crop=cv2.warpAffine(img,sim(lm,T),(112,112),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0)
    if crop is None or crop.shape!=(112,112,3):fail("alignment_output_invalid","aligned crop invalid")
    blob=cv2.dnn.blobFromImage(crop,1/127.5,(112,112),(127.5,127.5,127.5),swapRB=True,crop=False,ddepth=cv2.CV_32F)
    if blob.shape!=(1,3,112,112) or not np.isfinite(blob).all():fail("preprocessing_output_invalid","preprocessed tensor invalid")
    net=cv2.dnn.readNetFromONNX(a.auraface_model);net.setInput(blob,"data")
    raw=np.asarray(net.forward("1333"),np.float32).reshape(-1)
    if raw.size!=512:fail("auraface_output_dimension_invalid","AuraFace output must be 512D")
    if not np.isfinite(raw).all():fail("auraface_output_non_finite","AuraFace output non-finite")
    n=float(np.linalg.norm(raw))
    if not math.isfinite(n) or n<=np.finfo(np.float32).eps:fail("auraface_output_zero_norm","AuraFace output norm invalid")
    v=raw/n
    if v.size!=512 or not np.isfinite(v).all():fail("auraface_l2_output_invalid","L2 normalization failed")
    e={
      "version":"trust-face-auraface-512d-first-inference-evidence/v1","mode":"lab-one-shot",
      "execution":{"authorized":True,"completed":True,"benchmarkExecuted":False,"thresholdApplied":False,"matchedClaimed":False,"identityClaimed":False,"productionAuthorized":False},
      "model":{"modelId":"fal-auraface-v1-glintr100-512d","sourceIntegrityVerified":True,"artifactBytes":AB,"artifactSha256":"sha256:"+AS,"embeddingDim":512},
      "sample":{"sourceKind":"consented-local-allowlist","referenceStored":False,"pathStored":False,"fileNameStored":False,"contentDigestStored":False,"rawImageStored":False,"cropStored":False,"detectedFaceCount":1,"poseGatePassed":True,"detectorScoreStored":False,"bboxStored":False,"landmarksStored":False},
      "pipeline":{"alignment":"arcface-5pt-112x112-similarity","preprocessing":"(pixel-127.5)/127.5; swapRB=true; NCHW float32","inputTensorShape":[1,3,112,112],"outputDimension":512,"outputFinite":True,"outputNonZero":True,"downstreamL2NormalizationApplied":True,"rawEmbeddingStored":False,"normalizedEmbeddingStored":False,"cosineComputed":False},
      "runtime":{"opencvVersion":cv2.__version__,"numpyVersion":np.__version__},
      "privacy":{"biometricPayloadPersisted":False,"sampleIdentifierPersisted":False,"embeddingPersisted":False,"individualScorePersisted":False},
      "safety":{"benchmarkAuthorized":False,"benchmarkExecuted":False,"calibrationMutationAllowed":False,"thresholdCalibrated":False,"farFmrValidated":False,"frrFnmrValidated":False,"productUseEligible":False,"productionAuthorized":False,"productionReady":False,"biometricClaimReady":False}
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.output)),exist_ok=True)
    with open(a.output,"w",encoding="utf-8") as fh:json.dump(e,fh,indent=2,sort_keys=True);fh.write("\n")
    print(json.dumps({"inferenceExecuted":True,"outputDimension":512,"outputFinite":True,"downstreamL2NormalizationApplied":True,"rawImageStored":False,"cropStored":False,"embeddingStored":False,"benchmarkExecuted":False,"thresholdApplied":False,"identityClaimed":False,"productionAuthorized":False},separators=(",",":")))

if __name__=="__main__":main()
