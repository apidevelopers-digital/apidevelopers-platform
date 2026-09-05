#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.request

RUN_ID = 33950069289
REPO = os.environ.get("GITHUB_REPOSITORY", "").strip()
TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
OUTPUT = "packages/trust-face-engine/docs/AURAFACE_512D_FIRST_INFERENCE_JOB_DIAGNOSTIC_V1.json"

if not REPO or "/" not in REPO:
    raise SystemExit("GITHUB_REPOSITORY is required")
if not TOKEN:
    raise SystemExit("GITHUB_TOKEN is required")

url = f"https://api.github.com/repos/{REPO}/actions/runs/{RUN_ID}/jobs?per_page=100"
req = urllib.request.Request(
    url,
    headers={
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "trust-face-job-diagnostic-v1",
    },
)
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
except urllib.error.HTTPError as exc:
    raise SystemExit(f"GitHub jobs API read failed with HTTP {exc.code}") from exc

jobs = payload.get("jobs") or []
failed = [job for job in jobs if job.get("conclusion") == "failure"]
if not jobs:
    raise SystemExit("no jobs returned for source run")
if len(failed) != 1:
    raise SystemExit(f"expected exactly one failed job, got {len(failed)}")

job = failed[0]
steps = []
for step in job.get("steps") or []:
    steps.append(
        {
            "number": step.get("number"),
            "name": step.get("name"),
            "status": step.get("status"),
            "conclusion": step.get("conclusion"),
            "startedAt": step.get("started_at"),
            "completedAt": step.get("completed_at"),
        }
    )

failed_steps = [step for step in steps if step.get("conclusion") == "failure"]
failed_step = failed_steps[0] if len(failed_steps) == 1 else None

out = {
    "version": "trust-face-auraface-512d-first-inference-job-diagnostic/v1",
    "sourceRunId": RUN_ID,
    "sourceRunConclusion": "failure",
    "jobsReturned": len(jobs),
    "failedJobCount": len(failed),
    "failedJob": {
        "id": job.get("id"),
        "name": job.get("name"),
        "runnerName": job.get("runner_name"),
        "runnerGroupName": job.get("runner_group_name"),
        "status": job.get("status"),
        "conclusion": job.get("conclusion"),
        "startedAt": job.get("started_at"),
        "completedAt": job.get("completed_at"),
    },
    "steps": steps,
    "failedStep": failed_step,
    "interpretation": {
        "successful512DInferenceClaimAllowed": False,
        "retryAuthorizedByDiagnostic": False,
        "rawLogRead": False,
        "sampleAccessedByDiagnostic": False,
        "modelAccessedByDiagnostic": False,
        "inferenceExecutedByDiagnostic": False,
    },
    "privacy": {
        "samplePathStored": False,
        "sampleFileNameStored": False,
        "sampleContentDigestStored": False,
        "imageStored": False,
        "cropStored": False,
        "embeddingStored": False,
        "individualScoreStored": False,
    },
}

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
with open(OUTPUT, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=2, sort_keys=True)
    fh.write("\n")

print(json.dumps({
    "sourceRunId": RUN_ID,
    "runnerName": out["failedJob"]["runnerName"],
    "failedStep": None if failed_step is None else failed_step.get("name"),
    "failedStepNumber": None if failed_step is None else failed_step.get("number"),
    "rawLogRead": False,
    "inferenceExecutedByDiagnostic": False,
}, separators=(",", ":")))
