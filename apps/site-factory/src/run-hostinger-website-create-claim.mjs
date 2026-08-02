import {
  validateCreateAuthorization,
} from "./hostinger-website-create-contract.mjs";
import {
  buildExecutionLock,
  claimExecutionLock,
} from "./hostinger-website-create-lock.mjs";
import {
  validateExistingExecutionLock,
} from "./hostinger-website-create-lock-validation.mjs";
import {
  readGithubJson,
} from "./hostinger-website-create-github.mjs";

const DRAFT_REF = "b13fa5992344663b94c8f64dfea5ff448341ec55";
const DRAFT_PATH =
  "apps/site-factory/evidence/hostinger-website-create-draft-latest.json";
const APPROVAL_REF = "1987a754c75ef495a395af356117779b6452ec71";
const APPROVAL_PATH =
  "apps/site-factory/evidence/hostinger-website-create-approval.json";
const EXPECTED_FINGERPRINT =
  "33d5b094f12cbb9a1b5513853d69755ba4f05dced90d8f13fc950ca869c5a1c6";
const MAX_DRAFT_AGE_MS = 6 * 60 * 60 * 1000;

function env(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_environment:${name}`);
  }
  return value.trim();
}

const repository = env("GITHUB_REPOSITORY");
const githubToken = env("GITHUB_TOKEN");
const draft = await readGithubJson({
  token: githubToken,
  repository,
  ref: DRAFT_REF,
  path: DRAFT_PATH,
});
const approval = await readGithubJson({
  token: githubToken,
  repository,
  ref: APPROVAL_REF,
  path: APPROVAL_PATH,
});

const authorization = validateCreateAuthorization({
  draft,
  approval,
  expectedFingerprint: EXPECTED_FINGERPRINT,
  expectedRepository: repository,
  maxDraftAgeMs: MAX_DRAFT_AGE_MS,
)});

const lock = buildExecutionLock({
  authorization,
  repository,
  sourceSha: env("GITHUB_SHA"),
  workflowRunId: env("GITHUB_RUN_ID"),
});
const claimed = await claimExecutionLock({
  token: githubToken,
  repository,
  sourceSha: env("GITHUB_SHA"),
  lock,
});

if (!claimed.claimed) {
  const resumed = validateExistingExecutionLock({
    lock: claimed.existing,
    authorization,
    repository,
  });

  process.stdout.write(
    `${JSON.stringify({
      status: "resumed_from_existing_lock",
      executable: false,
      domain: lock.target.domain,
      datacenterCode: lock.target.datacenterCode,
      orderReference: lock.target.orderReference,
      draftFingerprint: lock.source.draftFingerprint,
      lockFingerprint: resumed.fingerprint,
      originalWorkflowRunId: resumed.workflowRunId,
      ...claimed,
    })}\n`,
  );
  process.exit(0);
}

process.stdout.write(
  `${JSON.stringify({
    status: "claimed",
    executable: false,
    domain: lock.target.domain,
    datacenterCode: lock.target.datacenterCode,
    orderReference: lock.target.orderReference,
    draftFingerprint: lock.source.draftFingerprint,
    lockFingerprint: lock.fingerprint,
    ...claimed,
  })}\n`,
);
