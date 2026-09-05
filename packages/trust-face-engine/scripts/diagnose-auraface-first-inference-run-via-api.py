#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.error
import urllib.request

RUN_ID = 33950069289
API = "https://api.github.com"
REPO = os.environ.get("GITHUB_REPOSITORY", "").strip()
TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
OUTPUT = "packages/trust-face-engine/docs/AURAFACE_512D_FIRST_INFERENCE_FAILURE_DIAGNOSTIC_V1.json"

if not REPO or "/" not in REPO:
    raise SystemExit("GITHUB_REPOSITORY is required")
if not TOKEN:
    raise SystemExit("GITHUB_TOKEN is required")

headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {TOKEN}",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "trust-face-failure-diagnostic-v1",
}

def get(url, *, binary=False):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"GitHub API read failed with HTTP {exc.code}") from exc
    return data if binary else data.decode("utf-8", errors="replace")

jobs_payload = json.loads(get(f"{API}/repos/{REPO}/actions/runs/{RUN_ID}/jobs?per_page=100"))
jobs = jobs_payload.get("jobs") or []
failed_jobs = [job for job in jobs if job.get("conclusion") == "failure"]
if len(failed_jobs) != 1:
    raise SystemExit(f"expected exactly one failed job, got {len(failed_jobs)}")

job = failed_jobs[0]
job_id = int(job["id"])
steps = job.get("steps") or []
failed_steps = [step for step in steps if step.get("conclusion") == "failure"]
failed_step = failed_steps[0] if failed_steps else None

log_text = get(f"{API}/repos/{REPO}/actions/jobs/{job_id}/logs")

allowed_stages = {
    "preflight_started",
    "authorized_sample_discovery_started",
    "model_integrity_started",
    "runtime_preparation_started",
    "first_inference_started",
    "evidence_validation_started",
    "first_inference_completed",
}

stage = None
for match in re.finditer(r"\bstage=([a-z0-9_]+)\b", log_text):
    candidate = match.group(1)
    if candidate in allowed_stages:
        stage = candidate

error_code = None
for pattern in [
    r'"error"\s*:\s*"([a-z0-9_]+)"',
    r"\berror=([a-z0-9_]+)\b",
]:
    matches = re.findall(pattern, log_text)
    if matches:
        error_code = matches[-1]

markers = {
    "authorizedSampleFoundFalse": "authorizedSampleFound=false" in log_text,
    "runtimePythonUnavailable": "python3.11 unavailable" in log_text,
    "runtimeVerified": "runtime_verified=true" in log_text,
    "inferenceSuccessNotice": "inferenceExecuted=true" in log_text
        and "outputDimension=512" in log_text
        and "embeddingStored=false" in log_text,
    "evidenceValid": "evidence_valid=true" in log_text,
}

if error_code is None:
    if markers["authorizedSampleFoundFalse"]:
        error_code = "authorized_sample_not_found"
    elif markers["runtimePythonUnavailable"]:
        error_code = "python311_unavailable"

inference_completion_evidenced = bool(
    markers["inferenceSuccessNotice"]
    or markers["evidenceValid"]
    or stage in {"evidence_validation_started", "first_inference_completed"}
)
inference_attempt_may_have_started = bool(
    stage in {"first_inference_started", "evidence_validation_started", "first_inference_completed"}
)
if stage in {
    "preflight_started",
    "authorized_sample_discovery_started",
    "model_integrity_started",
    "runtime_preparation_started",
}:
    inference_attempt_may_have_started = False

payload = {
    "version": "trust-face-auraface-512d-first-inference-failure-diagnostic/v1",
    "sourceRunId": RUN_ID,
    "sourceRunConclusion": "failure",
    "job": {
        "id": job_id,
        "name": job.get("name"),
        "runnerName": job.get("runner_name"),
        "runnerGroupName": job.get("runner_group_name"),
        "status": job.get("status"),
        "conclusion": job.get("conclusion"),
        "startedAt": job.get("started_at"),
        "completedAt": job.get("completed_at"),
    },
    "failedStep": None if failed_step is None else {
        "name": failed_step.get("name"),
        "number": failed_step.get("number"),
        "conclusion": failed_step.get("conclusion"),
    },
    "sanitizedLogSignals": {
        "stage": stage,
        "errorCode": error_code,
        **markers,
    },
    "interpretation": {
        "inferenceCompletionEvidenced": inference_completion_evidenced,
        "inferenceAttemptMayHaveStarted": inference_attempt_may_have_started,
        "safeToClaimSuccessful512DInference": False,
        "safeToRerunWithoutNewApproval": False if inference_attempt_may_have_started else None,
    },
    "privacy": {
        "rawLogPersisted": False,
        "samplePathPersisted": False,
        "sampleFileNamePersisted": False,
        "sampleContentDigestPersisted": False,
        "imagePersisted": False,
        "cropPersisted": False,
        "embeddingPersisted": False,
        "individualScorePersisted": False,
    },
    "diagnostic": {
        "inferenceExecutedByDiagnostic": False,
        "benchmarkExecutedByDiagnostic": False,
        "sampleAccessedByDiagnostic": False,
        "modelAccessedByDiagnostic": False,
        "thresholdAppliedByDiagnostic": False,
        "identityClaimedByDiagnostic": False,
        "productionAuthorized": False,
    },
}

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
with open(OUTPUT, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, indent=2, sort_keys=True)
    fh.write("\n")

print(json.dumps({
    "sourceRunId": RUN_ID,
    "runnerName": payload["job"]["runnerName"],
    "failedStepName": None if failed_step is None else failed_step.get("name"),
    "stage": stage,
    "errorCode": error_code,
    "inferenceCompletionEvidenced": inference_completion_evidenced,
    "inferenceAttemptMayHaveStarted": inference_attempt_may_have_started,
    "rawLogPersisted": False,
}, separators=(",", ":")))
