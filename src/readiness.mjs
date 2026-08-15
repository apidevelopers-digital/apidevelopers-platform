const VALID_STATUSES = new Set(["ok", "error"]);

function normalizeCheck(check, index) {
  if (!check || typeof check !== "object") {
    throw new TypeError(`checks[${index}] must be an object`);
  }
  if (typeof check.name !== "string" || check.name.trim() === "") {
    throw new TypeError(`checks[${index}].name must be a non-empty string`);
  }
  if (typeof check.run !== "function") {
    throw new TypeError(`checks[${index}].run must be a function`);
  }

  return Object.freeze({
    name: check.name.trim(),
    critical: check.critical !== false,
    run: check.run,
  });
}

function sanitizeCode(value) {
  if (typeof value !== "string") return undefined;
  const code = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return code.slice(0, 80) || undefined;
}

function defaultChecks() {
  return [
    Object.freeze({
      name: "process",
      critical: true,
      async run() {
        return { status: "ok", code: "running" };
      },
    }),
  ];
}

export function createReadinessService({
  checks = defaultChecks(),
  now = () => new Date().toISOString(),
} = {}) {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new TypeError("checks must be a non-empty array");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  const normalizedChecks = Object.freeze(checks.map(normalizeCheck));

  return Object.freeze({
    async check() {
      const results = await Promise.all(
        normalizedChecks.map(async (check) => {
          try {
            const outcome = await check.run();
            const status = outcome?.status ?? "ok";
            if (!VALID_STATUSES.has(status)) {
              throw new TypeError(`unsupported readiness status: ${status}`);
            }

            return Object.freeze({
              name: check.name,
              critical: check.critical,
              status,
              ...(sanitizeCode(outcome?.code) ? { code: sanitizeCode(outcome.code) } : {}),
            });
          } catch {
            return Object.freeze({
              name: check.name,
              critical: check.critical,
              status: "error",
              code: "check_failed",
            });
          }
        }),
      );

      const failed = results.filter((result) => result.status === "error");
      const status =
        failed.length === 0
          ? "ready"
          : failed.some((result) => result.critical)
            ? "unavailable"
            : "degraded";

      return Object.freeze({
        service: "api-gateway",
        status,
        checkedAt: now(),
        checks: Object.freeze(results),
      });
    },
  });
}
