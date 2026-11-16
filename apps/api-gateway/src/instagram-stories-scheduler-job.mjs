/*
 * Instagram Stories Scheduler Job
 *
 * Internal job wrapper for the safe Instagram Stories scheduler publisher.
 * This file contains no tokens. It is safe by default:
 * - dryRun defaults to true unless explicit approval env is present
 * - real publish requires an injected access token provider
 * - CLI real publish requires INSTAGRAM_SCHEDULER_EXECUTE=IGOR_APROVA_INSTAGRAM_SCHEDULER_REAL
 *
 * Failure semantics:
 * - dry-run can finish successfully after planning
 * - real runs fail the process when any item fails, when zero items are published while items were planned,
 *   or when the publisher reports ok=false. This prevents green GitHub Actions with zero Instagram output.
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  InstagramSchedulerError,
  runInstagramStoriesSchedule,
} from "./instagram-stories-scheduler-publisher.mjs";

const DEFAULT_PLAN_URL =
  "https://sitedauni.com/assets/campanhas/_instagram_scheduler/plano_stories_recorrente_20261116_20261122.json";

const DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com/v21.0";
const REAL_EXECUTION_CONFIRMATION = "IGOR_APROVA_INSTAGRAM_SCHEDULER_REAL";

export class InstagramSchedulerJobError extends Error {
  constructor(code, message, details = {}) {
    super(message ?? code);
    this.name = "InstagramSchedulerJobError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function todayInSaoPaulo(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

export async function loadJsonFromUrl({ fetchImpl = globalThis.fetch, url }) {
  if (typeof fetchImpl !== "function") {
    throw new InstagramSchedulerJobError("fetch_unavailable", "fetch implementation is required");
  }

  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new InstagramSchedulerJobError("invalid_json_response", "Plan URL did not return valid JSON", {
      url,
      status: response.status,
      sample: text.slice(0, 500),
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!response.ok) {
    throw new InstagramSchedulerJobError("plan_fetch_failed", "Failed to fetch scheduler plan", {
      url,
      status: response.status,
      payload,
    });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InstagramSchedulerJobError("invalid_plan_payload", "Scheduler plan must be a JSON object", { url });
  }

  return payload;
}

export async function writeJsonLog({ logDir, targetDate, payload }) {
  if (!logDir) return null;
  await mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, `${targetDate}.json`);
  await writeFile(logPath, JSON.stringify(payload, null, 2), "utf8");
  return logPath;
}

export function createEnvironmentAccessTokenProvider({
  env = process.env,
  variableName = "META_INSTAGRAM_ACCESS_TOKEN",
} = {}) {
  return async function resolveAccessToken() {
    const token = String(env[variableName] ?? "").trim();
    if (!token) {
      throw new InstagramSchedulerJobError("missing_meta_access_token", `Missing ${variableName}`);
    }
    return token;
  };
}

export function resultFailureSummary(result) {
  const results = Array.isArray(result?.results) ? result.results : [];
  const failed = results.filter((entry) => !entry?.ok);
  const succeeded = results.filter((entry) => entry?.ok);
  return {
    failedCount: failed.length,
    succeededCount: succeeded.length,
    failed,
  };
}

export function assertRealRunSucceeded(result) {
  if (result?.dryRun) return;

  const planned = Number(result?.planned ?? 0);
  const published = Number(result?.published ?? 0);
  const { failedCount, failed } = resultFailureSummary(result);

  if (!result?.ok) {
    throw new InstagramSchedulerJobError("instagram_scheduler_result_not_ok", "Instagram scheduler returned ok=false", {
      planned,
      published,
      failedCount,
      failed: failed.slice(0, 20),
    });
  }

  if (planned > 0 && published <= 0) {
    throw new InstagramSchedulerJobError(
      "instagram_scheduler_zero_published",
      "Instagram scheduler planned items but published zero stories",
      {
        planned,
        published,
        failedCount,
        failed: failed.slice(0, 20),
      },
    );
  }

  if (failedCount > 0) {
    throw new InstagramSchedulerJobError("instagram_scheduler_partial_failure", "One or more stories failed to publish", {
      planned,
      published,
      failedCount,
      failed: failed.slice(0, 20),
    });
  }
}

export async function runInstagramStoriesSchedulerJob({
  fetchImpl = globalThis.fetch,
  planUrl = DEFAULT_PLAN_URL,
  targetDate = todayInSaoPaulo(),
  dryRun = true,
  graphBaseUrl = DEFAULT_GRAPH_BASE_URL,
  accessTokenProvider,
  logDir,
  logger = undefined,
} = {}) {
  const plan = await loadJsonFromUrl({ fetchImpl, url: planUrl });

  let accessToken = null;
  if (!dryRun) {
    if (typeof accessTokenProvider !== "function") {
      throw new InstagramSchedulerJobError(
        "access_token_provider_required",
        "Real publish requires a protected access token provider",
      );
    }
    accessToken = await accessTokenProvider({ targetDate, plan });
  }

  const result = await runInstagramStoriesSchedule({
    plan,
    targetDate,
    accessToken,
    dryRun,
    fetchImpl,
    graphBaseUrl,
    logger,
  });

  const summary = resultFailureSummary(result);

  const logPayload = {
    ok: result.ok,
    generatedAt: new Date().toISOString(),
    targetDate,
    planUrl,
    dryRun,
    graphBaseUrl,
    planned: result.planned,
    published: result.published,
    due: result.due,
    reason: result.reason,
    failedCount: summary.failedCount,
    succeededCount: summary.succeededCount,
    results: result.results,
  };

  const logPath = await writeJsonLog({ logDir, targetDate, payload: logPayload });

  const finalResult = Object.freeze({
    ...result,
    targetDate,
    planUrl,
    logPath,
    failedCount: summary.failedCount,
    succeededCount: summary.succeededCount,
  });

  assertRealRunSucceeded(finalResult);

  return finalResult;
}

export function parseCliArgs(argv = process.argv.slice(2), env = process.env) {
  const args = new Map();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) args.set(match[1], match[2]);
  }

  const executeConfirmation = String(env.INSTAGRAM_SCHEDULER_EXECUTE ?? "").trim();
  const dryRun = executeConfirmation !== REAL_EXECUTION_CONFIRMATION;

  return Object.freeze({
    planUrl: args.get("plan-url") ?? env.INSTAGRAM_SCHEDULER_PLAN_URL ?? DEFAULT_PLAN_URL,
    targetDate: args.get("date") ?? env.INSTAGRAM_SCHEDULER_DATE ?? todayInSaoPaulo(),
    logDir: args.get("log-dir") ?? env.INSTAGRAM_SCHEDULER_LOG_DIR,
    dryRun,
    tokenVariableName:
      args.get("token-env") ?? env.INSTAGRAM_SCHEDULER_TOKEN_ENV ?? "META_INSTAGRAM_ACCESS_TOKEN",
  });
}

async function main() {
  const args = parseCliArgs();
  const result = await runInstagramStoriesSchedulerJob({
    planUrl: args.planUrl,
    targetDate: args.targetDate,
    dryRun: args.dryRun,
    logDir: args.logDir,
    accessTokenProvider: createEnvironmentAccessTokenProvider({
      variableName: args.tokenVariableName,
    }),
    logger: (event) => {
      const safeEvent = { ...event };
      delete safeEvent.accessToken;
      console.log(JSON.stringify(safeEvent));
    },
  });

  console.log(JSON.stringify({
    event: "instagram_scheduler_job_finished",
    ok: result.ok,
    targetDate: result.targetDate,
    dryRun: result.dryRun,
    planned: result.planned,
    published: result.published,
    failedCount: result.failedCount,
    succeededCount: result.succeededCount,
    logPath: result.logPath,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const payload = {
      event: "instagram_scheduler_job_failed",
      ok: false,
      code: error?.code ?? "unknown_error",
      message: error instanceof Error ? error.message : String(error),
      details: error?.details ?? undefined,
    };

    if (error instanceof InstagramSchedulerError) {
      payload.schedulerError = true;
    }
    if (error instanceof InstagramSchedulerJobError) {
      payload.schedulerJobError = true;
    }

    console.error(JSON.stringify(payload));
    process.exitCode = 1;
  });
}
