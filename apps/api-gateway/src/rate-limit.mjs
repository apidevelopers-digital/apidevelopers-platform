function normalizePositiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return parsed;
}

export function createFixedWindowRateLimiter({
  limit = 120,
  windowMs = 60_000,
  clock = () => Date.now(),
} = {}) {
  const resolvedLimit = normalizePositiveInteger(limit, 120, "limit");
  const resolvedWindowMs = normalizePositiveInteger(
    windowMs,
    60_000,
    "windowMs",
  );
  const buckets = new Map();

  function consume(key) {
    if (typeof key !== "string" || key.trim() === "") {
      throw new TypeError("rate limit key must be a non-empty string");
    }

    const now = clock();
    const current = buckets.get(key);

    const bucket =
      !current || now >= current.resetAt
        ? { count: 0, resetAt: now + resolvedWindowMs }
        : current;

    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(resolvedLimit - bucket.count, 0);
    const retryAfterSeconds = Math.max(
      Math.ceil((bucket.resetAt - now) / 1000),
      1,
    );

    return Object.freeze({
      allowed: bucket.count <= resolvedLimit,
      limit: resolvedLimit,
      remaining,
      resetAt: bucket.resetAt,
      retryAfterSeconds,
    });
  }

  return Object.freeze({
    consume,
    reset(key) {
      buckets.delete(key);
    },
  });
}
