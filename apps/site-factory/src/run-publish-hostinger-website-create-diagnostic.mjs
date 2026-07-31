import {
  buildWebsiteCreateDiagnostic,
  publishWebsiteCreateDiagnostic,
} from "./hostinger-website-create-diagnostic.mjs";

function env(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_environment:${name}`);
  }
  return value.trim();
}

const diagnostic = buildWebsiteCreateDiagnostic({
  repository: env("GITHUB_REPOSITORY"),
  sourceSha: env("GITHUB_SHA"),
  workflowRunId: env("GITHUB_RUN_ID"),
  workflowRunAttempt: env("GITHUB_RUN_ATTEMPT"),
  eventName: env("GITHUB_EVENT_NAME"),
  outcomes: {
    validate: process.env.VALIDATE_OUTCOME,
    secret: process.env.SECRET_OUTCOME,
    claim: process.env.CLAIM_OUTCOME,
    execute: process.env.EXECUTE_OUTCOME,
  },
});

const published = await publishWebsiteCreateDiagnostic({
  token: env("GITHUB_TOKEN"),
  repository: env("GITHUB_REPOSITORY"),
  sourceSha: env("GITHUB_SHA"),
  diagnostic,
});

process.stdout.write(
  `${JSON.stringify({
    status: "diagnostic_published",
    failedPhase: diagnostic.failedPhase,
    steps: diagnostic.steps,
    fingerprint: diagnostic.fingerprint,
    ...published,
  })}\n`,
);
