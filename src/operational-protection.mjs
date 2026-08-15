import { createHash } from "node:crypto";

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(", ") : value,
    ]),
  );
}

function extractCredential(headers = {}) {
  const normalized = normalizeHeaders(headers);
  const direct = normalized["x-api-key"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const authorization = normalized.authorization;
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^(?:ApiKey|Bearer)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function credentialFingerprint(headers = {}) {
  const credential = extractCredential(headers);
  if (!credential) return "anonymous";
  return createHash("sha256").update(credential).digest("hex").slice(0, 16);
}

function createMetrics() {
  const counters = new Map();

  function increment(name, labels = {}) {
    const key = JSON.stringify([name, Object.entries(labels).sort()]);
    const current = counters.get(key) ?? { name, labels: { ...labels }, value: 0 };
    counters.set(key, { ...current, value: current.value + 1 });
  }

  function snapshot() {
    return Object.freeze(
      [...counters.values()]
        .map((entry) => Object.freeze({
          name: entry.name,
          labels: Object.freeze({ ...entry.labels }),
          value: entry.value,
        }))
        .sort((left, right) =>
          `${left.name}:${JSON.stringify(left.labels)}`.localeCompare(
            `${right.name}:${JSON.stringify(right.labels)}`,
          ),
        ),
    );
  }

  return Object.freeze({ increment, snapshot });
}

export function createFixedWindowRateLimiter({
  limit = 60,
  windowMs = 60_000,
  clock = () => Date.now(),
} = {}) {
  requirePositiveInteger(limit, "limit");
  requirePositiveInteger(windowMs, "windowMs");

  const buckets = new Map();

  return Object.freeze({
    consume(key) {
      const now = Number(clock());
      const bucket = buckets.get(key);

      if (!bucket || now >= bucket.resetAt) {
        const next = { count: 1, resetAt: now + windowMs };
        buckets.set(key, next);
        return Object.freeze({
          allowed: true,
          remaining: limit - 1,
          resetAt: next.resetAt,
        });
      }

      if (bucket.count >= limit) {
        return Object.freeze({
          allowed: false,
          remaining: 0,
          resetAt: bucket.resetAt,
        });
      }

      bucket.count += 1;
      return Object.freeze({
        allowed: true,
        remaining: limit - bucket.count,
        resetAt: bucket.resetAt,
      });
    },
  });
}

export function createOperationalProtection({
  app,
  rateLimiter = createFixedWindowRateLimiter(),
  auditSink = () => {},
  metrics = createMetrics(),
  clock = () => new Date().toISOString(),
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (typeof rateLimiter?.consume !== "function") {
    throw new TypeError("rateLimiter.consume must be a function");
  }
  if (typeof auditSink !== "function") {
    throw new TypeError("auditSink must be a function");
  }

  return Object.freeze({
    metrics,
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const url = String(request.url ?? "/");
      const isProtected = url !== "/health";
      const fingerprint = credentialFingerprint(request.headers);

      metrics.increment("gateway_requests_total", { method, route: url });

      if (isProtected) {
        const decision = rateLimiter.consume(fingerprint);
        if (!decision.allowed) {
          metrics.increment("gateway_rate_limited_total", { route: url });
          auditSink(Object.freeze({
            type: "gateway.rate_limited",
            occurredAt: clock(),
            method,
            route: url,
            credentialFingerprint: fingerprint,
            resetAt: decision.resetAt,
          }));

          return {
            status: 429,
            headers: Object.freeze({
              "content-type": "application/json; charset=utf-8",
            }),
            body: JSON.stringify({ error: "rate_limited" }),
          };
        }
      }

      const response = await app.handleRequest(request);
      metrics.increment("gateway_responses_total", {
        route: url,
        status: String(response.status),
      });

      if (isProtected) {
        const outcome =
          response.status === 200 ? "authenticated" :
          response.status === 401 ? "unauthorized" :
          response.status === 503 ? "unavailable" :
          "other";

        auditSink(Object.freeze({
          type: "gateway.authentication",
          occurredAt: clock(),
          method,
          route: url,
          outcome,
          status: response.status,
          credentialFingerprint: fingerprint,
        }));
      }

      return response;
    },
  });
}
