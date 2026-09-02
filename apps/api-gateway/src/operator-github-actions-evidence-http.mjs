import { createHash } from "node:crypto";

import {
  GitHubActionsEvidenceError,
  requireGitHubIdentifier,
  requireRunId,
} from "./operator-github-actions-evidence-contract.mjs";
import {
  OPERATOR_READONLY_CAPABILITIES,
  requireText,
} from "./operator-readonly-contract.mjs";

const ROUTE = "/v1/operator/github/actions/evidence";
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const ACTION = "operator.readonly.read";
const OPERATION_ID = "operator.github.actions.evidence.read";

function jsonResponse(status, payload, extraHeaders = {}) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    }),
    body: JSON.stringify(payload),
  });
}

function failure(status, error, correlationId, extraHeaders = {}) {
  return jsonResponse(
    status,
    {
      error,
      ...(correlationId ? { correlationId } : {}),
      productionChanged: false,
      contentReturned: false,
      rowsReturned: false,
      valuesReturned: false,
      evidenceReturned: false,
    },
    extraHeaders,
  );
}

function header(headers, name) {
  if (!headers || typeof headers !== "object") return undefined;
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

function extractCredential(headers = {}) {
  const direct = header(headers, "x-api-key");
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const authorization = header(headers, "authorization");
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^(?:ApiKey|Bearer)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function credentialFingerprint(headers = {}) {
  const credential = extractCredential(headers);
  if (!credential) return "anonymous";
  return createHash("sha256").update(credential).digest("hex").slice(0, 16);
}

function bodyBytes(body) {
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    return Buffer.byteLength(body);
  }
  if (body === undefined || body === null) return 0;
  return Buffer.byteLength(JSON.stringify(body));
}

function parseBody(body) {
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    !Buffer.isBuffer(body)
  ) {
    return body;
  }
  if (typeof body !== "string" || body.trim() === "") {
    throw new GitHubActionsEvidenceError(
      "invalid_github_actions_request",
      "JSON request body is required",
      400,
    );
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("object required");
    }
    return parsed;
  } catch {
    throw new GitHubActionsEvidenceError(
      "invalid_github_actions_request",
      "request body must be a JSON object",
      400,
    );
  }
}

function assertAllowedKeys(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new GitHubActionsEvidenceError(
        "invalid_github_actions_request",
        "request contains an unsupported field",
        400,
      );
    }
  }
}

function correlationIdFrom(request, body) {
  const candidate =
    body.correlationId ??
    header(request.headers, "x-correlation-id") ??
    header(request.headers, "x-request-id");
  try {
    return requireText(candidate, "correlationId");
  } catch {
    throw new GitHubActionsEvidenceError(
      "invalid_github_actions_request",
      "correlationId is required",
      400,
    );
  }
}

function publicDecision(decision) {
  return Object.freeze({
    decisionId: String(decision.decisionId ?? ""),
    effect: decision.effect,
    policyVersion: String(decision.policyVersion ?? ""),
  });
}

function statusForError(error) {
  if (error instanceof GitHubActionsEvidenceError) {
    if (error.code === "invalid_github_actions_request") return 400;
    if (error.code === "github_actions_transport_unavailable") return 503;
    if (error.code === "github_actions_request_failed") {
      if (error.status === 404) return 404;
      if (error.status === 429) return 429;
      if (error.status === 401 || error.status === 403) return 502;
      return 502;
    }
    if (
      error.code === "github_actions_contract_violation" ||
      error.code === "github_actions_evidence_invalid" ||
      error.code === "github_actions_transport_violation"
    ) {
      return 502;
    }
  }
  return 503;
}

function errorCode(error) {
  if (error instanceof GitHubActionsEvidenceError) return error.code;
  return "github_actions_evidence_unavailable";
}

function auditMetadata({
  repository,
  runId,
  decision,
  result,
  outcome,
  error,
}) {
  return Object.freeze({
    operationId: OPERATION_ID,
    provider: "github",
    resourceType: "workflow_run_evidence",
    repository,
    runId,
    ...(result
      ? {
          runStatus: result.run.status,
          runConclusion: result.run.conclusion,
          jobCount: result.jobs.length,
          evidenceCount: result.evidence.length,
        }
      : {}),
    authorizationEffect: decision?.effect ?? "unavailable",
    ...(error ? { errorCode: error } : {}),
    outcome,
    productionChanged: false,
    contentReturned: false,
    rowsReturned: false,
    valuesReturned: false,
  });
}

async function recordAudit({
  audit,
  identity,
  tenantId,
  resource,
  correlationId,
  repository,
  runId,
  decision,
  outcome,
  result,
  error,
}) {
  return audit.recordOperatorCapabilityResult({
    identity,
    tenantId,
    action: ACTION,
    resource,
    outcome,
    correlationId,
    metadata: auditMetadata({
      repository,
      runId,
      decision,
      result,
      outcome,
      error,
    }),
  });
}

export function createGitHubActionsEvidenceHttpApp({
  app,
  authenticator,
  authorization,
  audit,
  rateLimiter,
  client,
  organization,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (typeof authorization?.decide !== "function") {
    throw new TypeError("authorization.decide must be a function");
  }
  if (typeof audit?.recordOperatorCapabilityResult !== "function") {
    throw new TypeError("audit.recordOperatorCapabilityResult must be a function");
  }
  if (typeof rateLimiter?.consume !== "function") {
    throw new TypeError("rateLimiter.consume must be a function");
  }
  if (typeof client?.getWorkflowRunEvidence !== "function") {
    throw new TypeError("client.getWorkflowRunEvidence must be a function");
  }
  const authority = requireGitHubIdentifier(organization, "organization");
  if (
    !Number.isSafeInteger(maxBodyBytes) ||
    maxBodyBytes < 1024 ||
    maxBodyBytes > 1024 * 1024
  ) {
    throw new TypeError("maxBodyBytes must be between 1024 and 1048576");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const parsedUrl = new URL(request.url ?? "/", "http://gateway.local");
      if (parsedUrl.pathname !== ROUTE) return app.handleRequest(request);

      if (String(request.method ?? "GET").toUpperCase() !== "POST") {
        return failure(405, "method_not_allowed", undefined, { allow: "POST" });
      }

      const rateDecision = rateLimiter.consume(
        credentialFingerprint(request.headers),
      );
      if (!rateDecision.allowed) {
        const retryAfter = Math.max(
          1,
          Math.ceil((Number(rateDecision.resetAt) - Date.now()) / 1000),
        );
        return failure(429, "rate_limited", undefined, {
          "retry-after": String(retryAfter),
        });
      }

      let size;
      try {
        size = bodyBytes(request.body);
      } catch {
        return failure(400, "invalid_github_actions_request");
      }
      if (size > maxBodyBytes) {
        return failure(413, "request_too_large");
      }

      let identity;
      try {
        identity = await authenticator.authenticate(request.headers ?? {});
      } catch {
        return failure(503, "authentication_unavailable");
      }
      if (!identity) return failure(401, "unauthorized");

      const tenantId = String(identity.principal?.tenantId ?? "").trim();
      const operatorId = String(identity.principal?.id ?? "").trim();
      if (!tenantId || !operatorId) {
        return failure(403, "tenant_context_unavailable");
      }

      let body;
      let correlationId;
      let repository;
      let runId;
      try {
        body = parseBody(request.body);
        assertAllowedKeys(body, ["correlationId", "repository", "runId"]);
        correlationId = correlationIdFrom(request, body);
        repository = requireGitHubIdentifier(body.repository, "repository");
        runId = requireRunId(body.runId);
      } catch (error) {
        return failure(statusForError(error), errorCode(error));
      }

      const resource =
        `github:workflow_run_evidence:${authority}/${repository}:${runId}`;

      let decision;
      try {
        decision = await authorization.decide({
          identity,
          action: ACTION,
          resource,
          requiredScopes: [OPERATOR_READONLY_CAPABILITIES.read.scope],
        });
      } catch {
        return failure(503, "authorization_unavailable", correlationId);
      }
      if (!decision || !["allow", "deny"].includes(decision.effect)) {
        return failure(503, "authorization_unavailable", correlationId);
      }

      if (decision.effect !== "allow") {
        try {
          await recordAudit({
            audit,
            identity,
            tenantId,
            resource,
            correlationId,
            repository,
            runId,
            decision,
            outcome: "denied",
            error: "forbidden",
          });
        } catch {
          // A denial remains denied if audit persistence is unavailable.
        }
        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision: publicDecision(decision),
          correlationId,
          productionChanged: false,
          contentReturned: false,
          rowsReturned: false,
          valuesReturned: false,
          evidenceReturned: false,
        });
      }

      let result;
      try {
        result = await client.getWorkflowRunEvidence({
          owner: authority,
          repository,
          runId,
          correlationId,
          tenantId,
        });
      } catch (error) {
        const code = errorCode(error);
        try {
          await recordAudit({
            audit,
            identity,
            tenantId,
            resource,
            correlationId,
            repository,
            runId,
            decision,
            outcome: "failed",
            error: code,
          });
        } catch {
          // The original read remains failed; no evidence is returned.
        }
        return failure(statusForError(error), code, correlationId);
      }

      try {
        await recordAudit({
          audit,
          identity,
          tenantId,
          resource,
          correlationId,
          repository,
          runId,
          decision,
          outcome: "success",
          result,
        });
      } catch {
        return failure(503, "audit_unavailable", correlationId);
      }

      return jsonResponse(200, {
        operationId: OPERATION_ID,
        provider: "github",
        resourceType: "workflow_run_evidence",
        correlationId,
        repository: result.repository,
        run: result.run,
        jobs: result.jobs,
        evidence: result.evidence,
        authorizationDecision: publicDecision(decision),
        productionChanged: false,
        contentReturned: false,
        rowsReturned: false,
        valuesReturned: false,
        evidenceReturned: true,
      });
    },
  });
}
