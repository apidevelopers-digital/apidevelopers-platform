export async function loadProjections(client, { signal } = {}) {
  const [institutional, learning] = await Promise.allSettled([
    client.institutionalSnapshot({ signal }),
    client.learningSnapshot({ signal }),
  ]);

  const result = {
    institutional: toProjectionResult("institutional", institutional),
    learning: toProjectionResult("learning", learning),
  };

  result.summary = summarize(result);
  return result;
}

function toProjectionResult(name, settled) {
  if (settled.status === "fulfilled") {
    return { name, ok: true, data: settled.value, error: null };
  }
  return {
    name,
    ok: false,
    data: null,
    error: toSafeError(settled.reason),
  };
}

function toSafeError(error) {
  const status = Number.isFinite(error?.status) ? error.status : 500;
  const policy = status === 401 || status === 403;
  return {
    code: String(error?.message || "PROJECTION_UNAVAILABLE"),
    status,
    retryable: policy ? false : error?.retryable !== false,
    policy,
  };
}

function summarize(result) {
  const successes = [result.institutional, result.learning].filter((entry) => entry.ok).length;
  if (successes === 2) return { kind: "ready", successes, failures: 0 };
  if (successes === 1) return { kind: "partial", successes, failures: 1 };
  const policyOnly = [result.institutional, result.learning].every((entry) => entry.error?.policy);
  return { kind: policyOnly ? "policy" : "error", successes: 0, failures: 2 };
}
