#!/usr/bin/env python3
import argparse, hashlib, json, math, os, posixpath, sys, zipfile
from collections import Counter, defaultdict
from itertools import combinations
import cv2 as cv
import numpy as np

N_ID=64; N_IMG=3; DIM=128
Y_SCORE=.70; Y_NMS=.30; Y_TOPK=5000
MAX_YAW=.30; MAX_ROLL=.25; MIN_EYES=.35
LOW=.31725; HIGH=.50375
BAND_SHA="69870e817be79f29a4cbbdd0a69b63d13eac8d5475026cd7c8e6b211306c7a64"
EXT={".jpg",".jpeg",".png",".webp",".bmp"}; MAX_BYTES=50_000_000

def die(x):
    print(json.dumps({"error":x},separators=(",",":")),file=sys.stderr); raise SystemExit(2)

def norm(p):
    p=p.replace("\\","/")
    while p.startswith("./"): p=p[2:]
    while "//" in p: p=p.replace("//","/")
    return p.strip("/")

def key(p): return hashlib.sha256(p.encode()).hexdigest()

def mk_detector(p):
    if hasattr(cv,"FaceDetectorYN_create"): return cv.FaceDetectorYN_create(p,"",(320,320),Y_SCORE,Y_NMS,Y_TOPK)
    return cv.FaceDetectorYN.create(p,"",(320,320),Y_SCORE,Y_NMS,Y_TOPK)

def mk_recognizer(p):
    if hasattr(cv,"FaceRecognizerSF_create"): return cv.FaceRecognizerSF_create(p,"")
    return cv.FaceRecognizerSF.create(p,"")

def pose(face):
    v=np.asarray(face,dtype=np.float64).reshape(-1)
    if v.size<14 or not np.isfinite(v[:14]).all() or v[2]<=0: return False,["invalid_pose_face_box"]
    re=(v[4],v[5]); le=(v[6],v[7]); nose=(v[8],v[9])
    dx=le[0]-re[0]; dy=le[1]-re[1]; span=math.hypot(dx,dy)
    if not math.isfinite(span) or span<=sys.float_info.epsilon: return False,["invalid_pose_landmarks"]
    yaw=abs(nose[0]-(le[0]+re[0])/2)/span; roll=abs(dy)/span; ratio=span/v[2]
    r=[]
    if yaw>MAX_YAW:r.append("pose_yaw_out_of_lab_range")
    if roll>MAX_ROLL:r.append("pose_roll_out_of_lab_range")
    if ratio<MIN_EYES:r.append("pose_eye_span_too_small")
    return not r,r

def stats(xs):
    if not xs:return {"count":0,"min":None,"max":None,"mean":None,"p05":None,"p50":None,"p95":None}
    a=np.asarray(xs,dtype=np.float64)
    return {"count":int(a.size),"min":float(a.min()),"max":float(a.max()),"mean":float(a.mean()),
            "p05":float(np.quantile(a,.05)),"p50":float(np.quantile(a,.5)),"p95":float(np.quantile(a,.95))}

def classes(xs):
    c=Counter("low_similarity" if x<=LOW else "high_similarity" if x>=HIGH else "indeterminate_retry" for x in xs)
    return {k:int(c[k]) for k in ("low_similarity","indeterminate_retry","high_similarity")}

def main():
    ap=argparse.ArgumentParser()
    for x in ("archive","yunet_model","sface_model","output","archive_sha256","yunet_sha256","sface_sha256","source_revision"):
        ap.add_argument("--"+x.replace("_","-"),dest=x,required=True)
    a=ap.parse_args()
    for p in (a.archive,a.yunet_model,a.sface_model):
        if not os.path.isfile(p): die("required_file_missing")
    detector=mk_detector(a.yunet_model); recognizer=mk_recognizer(a.sface_model)
    status=Counter(); reasons=Counter(); detect_hist=Counter(); em=defaultdict(list)
    with zipfile.ZipFile(a.archive) as z:
        groups=defaultdict(list); total=0
        for info in z.infolist():
            n=norm(info.filename)
            if info.is_dir() or n.startswith("__MACOSX/") or posixpath.splitext(n)[1].lower() not in EXT: continue
            total+=1; parent=norm(posixpath.dirname(n))
            if parent: groups[parent].append(info)
        elig=[]
        for p,infos in groups.items():
            if len(infos)==N_IMG: elig.append((key(p),p,sorted(infos,key=lambda x:norm(x.filename))))
        elig.sort(key=lambda x:(x[0],x[1]))
        if len(elig)<N_ID: die(f"not_enough_eligible_identities:{len(elig)}")
        selected=elig[:N_ID]; paths=[x[1] for x in selected]
        for _,p,infos in selected:
            for info in infos:
                if info.file_size<=0 or info.file_size>MAX_BYTES: status["image_size_out_of_range"]+=1; continue
                try: raw=z.read(info)
                except Exception: status["zip_member_read_failed"]+=1; continue
                if len(raw)!=info.file_size: status["zip_member_size_mismatch"]+=1; continue
                img=cv.imdecode(np.frombuffer(raw,dtype=np.uint8),cv.IMREAD_COLOR)
                if img is None or img.size==0: status["image_decode_failed"]+=1; continue
                h,w=img.shape[:2]
                try:
                    detector.setInputSize((int(w),int(h))); out=detector.detect(img); faces=out[1] if isinstance(out,tuple) else out
                except cv.error: status["yunet_detection_failed"]+=1; continue
                if faces is None: status["no_face_detected"]+=1; continue
                faces=np.asarray(faces,dtype=np.float32)
                if faces.ndim==1: faces=faces.reshape(1,-1)
                if faces.ndim!=2 or faces.shape[0]<1 or faces.shape[1]!=15 or not np.isfinite(faces).all():
                    status["invalid_yunet_output"]+=1; continue
                detect_hist[str(int(faces.shape[0]))]+=1
                face=faces[int(np.argmax(faces[:,14]))]
                ok,rs=pose(face)
                if not ok:
                    status["pose_rejected"]+=1
                    for r in rs: reasons[r]+=1
                    continue
                try:
                    aligned=recognizer.alignCrop(img,np.asarray(face[:14],dtype=np.float32))
                    vec=np.asarray(recognizer.feature(aligned),dtype=np.float32).reshape(-1)
                except cv.error: status["sface_inference_failed"]+=1; continue
                if vec.size!=DIM or not np.isfinite(vec).all(): status["invalid_sface_embedding"]+=1; continue
                n=float(np.linalg.norm(vec))
                if not math.isfinite(n) or n<=np.finfo(np.float32).eps: status["zero_sface_embedding"]+=1; continue
                em[p].append(vec/n); status["inference_completed"]+=1
    admitted=Counter(len(em.get(p,[])) for p in paths)
    same=[]
    for p in paths:
        for l,r in combinations(em.get(p,[]),2): same.append(float(np.dot(l,r)))
    diff=[]
    for i in range(len(paths)):
        for j in range(i+1,len(paths)):
            for l in em.get(paths[i],[]):
                for r in em.get(paths[j],[]): diff.append(float(np.dot(l,r)))
    ss,ds=stats(same),stats(diff); gap=None if not same or not diff else float(ss["min"]-ds["max"])
    fingerprint=hashlib.sha256(("\n".join(paths)).encode()).hexdigest()
    result={
      "version":"trust-face-controlface10k-benchmark-result/v1","mode":"lab-only","benchmarkOnly":True,
      "benchmarkExecuted":True,"executionCompleted":True,
      "github":{"runId":os.getenv("GITHUB_RUN_ID"),"triggerSha":os.getenv("GITHUB_SHA"),
        "runnerName":os.getenv("RUNNER_NAME"),"runnerOs":os.getenv("RUNNER_OS"),"runnerArch":os.getenv("RUNNER_ARCH")},
      "runtime":{"opencvVersion":cv.__version__,"numpyVersion":np.__version__},
      "source":{"dataset":"ControlFace10K","sourceType":"synthetic_permissive","declaredLicense":"CC-BY-4.0",
        "archiveBytes":os.path.getsize(a.archive),"archiveSha256":a.archive_sha256,"archiveExtracted":False},
      "models":{"opencvZooRevision":a.source_revision,"yuNetSha256":a.yunet_sha256,"sFaceSha256":a.sface_sha256,"sFaceEmbeddingDim":DIM},
      "subset":{"selectionMethod":"sha256-normalized-identity-path-ascending","eligibleIdentityDirectoryCount":len(elig),
        "totalImageMemberCount":total,"selectedIdentityCount":N_ID,"selectedImageCount":N_ID*N_IMG,
        "selectionFingerprintSha256":fingerprint,"selectedIdentityPathsStored":False,
        "demographicAttributeSelectionUsed":False,"resultAwareSelectionUsed":False},
      "pipeline":{"yuNetScoreThreshold":Y_SCORE,"poseGate":{"maxYawProxy":MAX_YAW,"maxRollProxy":MAX_ROLL,"minEyeSpanBoxRatio":MIN_EYES},
        "statusCounts":dict(sorted(status.items())),"poseRejectReasonCounts":dict(sorted(reasons.items())),
        "detectionCountHistogram":dict(sorted(detect_hist.items(),key=lambda x:int(x[0]))),
        "admittedImagesPerIdentityHistogram":{str(k):int(admitted[k]) for k in range(N_IMG+1)},
        "sFaceInferenceCount":int(status["inference_completed"])},
      "scores":{"samePerson":ss,"differentPerson":ds,"observedSampleGap":gap,
        "frozenBand":{"profileSha256":BAND_SHA,"lowSimilarityMax":LOW,"highSimilarityMin":HIGH,
          "samePersonClassifications":classes(same),"differentPersonClassifications":classes(diff),
          "thresholdApplied":False,"matchedClaimed":False,"identityClaimed":False,"thresholdCalibrated":False,
          "farFmrValidated":False,"frrFnmrValidated":False}},
      "privacy":{"rawImagesStored":False,"cropsStored":False,"embeddingsStored":False,"detectorScoresStored":False,
        "individualCosinesStored":False,"personAssociatedScoresStored":False},
      "safety":{"bandFrozen":True,"calibrationMutationAllowed":False,"productionAuthorized":False,
        "productionReady":False,"biometricClaimReady":False}}
    os.makedirs(os.path.dirname(os.path.abspath(a.output)),exist_ok=True)
    with open(a.output,"w",encoding="utf-8") as f: json.dump(result,f,indent=2,sort_keys=True); f.write("\n")
    print(json.dumps({"benchmarkExecuted":True,"selectedIdentityCount":N_ID,"selectedImageCount":N_ID*N_IMG,
      "sFaceInferenceCount":status["inference_completed"],"samePairCount":ss["count"],"differentPairCount":ds["count"],
      "observedSampleGap":gap,"thresholdApplied":False,"matchedClaimed":False,"productionReady":False},separators=(",",":")))

if __name__=="__main__": main()
