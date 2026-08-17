#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const DEFAULT_PARENT_READY_URL =
  "https://dodgerblue-heron-996886.hostingersite.com/ready";
const DEFAULT_PRODUCTION_READY_URL =
  "https://gateway.apidevelopers.digital/ready";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const outputPath = readArg("--output");
const timeoutMs = Number(process.env.GATEWAY_OBSERVABILITY_TIMEOUT_MS || "20000");
const parentReadyUrl =
  process.env.GATEWAY_PARENT_READY_URL || DEFAULT_PARENT_READY_URL;
const productionReadyUrl =
  process.env.GATEWAY_PRODUCTION_READY_URL || DEFAULT_PRODUCTION_READY_URL;

function normalizePersistence(payload) {
  const checks = Array.isArray(payload?.checks) ? payload.checks : [];
  const persistence = checks.find((check) => check?.name === "persistence");
  if (!persistence) return null;
  return {
    critical: persistence.critical === true,
    status: persistence.status ?? null,
    code: persistence.code ?? null,
  };
}

async function probe(name, url) {
  const startedAt = new Date().toISOString();
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "apidevelopers-platform/gateway-production-observability",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await response.text();
    let payload = null;
    let parseError = null;

    try {
      payload = JSON.parse(text);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }

    const persistence = normalizePersistence(payload);
    const valid =
      response.ok &&
      payload?.service === "api-gateway" &&
      payload?.status === "ready" &&
      persistence?.critical === true &&
      persistence?.status === "ok" &&
      persistence?.code === "readable";

    return {
      name,
      url,
      startedAt,
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - started),
      valid,
      service: payload?.service ?? null,
      status: payload?.status ?? null,
      persistence,
      error: parseError,
    };
  } catch (error) {
    return {
      name,
      url,
      startedAt,
      httpStatus: null,
      latencyMs: Math.round(performance.now() - started),
      valid: false,
      service: null,
      status: null,
      persistence: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const [parent, production] = await Promise.all([
  probe("hostinger_parent", parentReadyUrl),
  probe("production_domain", productionReadyUrl),
]);

let classification = "healthy";
if (!parent.valid && !production.valid) {
  classification = "runtime_or_upstream_unavailable";
} else if (parent.valid && !production.valid) {
  classification = "production_domain_routing_regression";
} else if (!parent.valid && production.valid) {
  classification = "parent_hostname_regression_or_aliasing_anomaly";
}

const report = {
  schema: "api-gateway-production-observability/v1",
  observedAt: new Date().toISOString(),
  classification,
  targets: {
    hostingerParent: parent,
    productionDomain: production,
  },
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(serialized);

if (outputPath) {
  await writeFile(outputPath, serialized, "utf8");
}

if (classification !== "healthy") {
  process.exitCode = 1;
}
