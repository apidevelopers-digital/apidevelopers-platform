import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { startOperationalGateway } from "../src/operational-server.mjs";

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function getJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

export async function runOperationalSmoke() {
  const directory = await mkdtemp(join(tmpdir(), "api-gateway-operational-smoke-"));
  const stateFilePath = join(directory, "state.json");
  const adminKey = "smoke-admin-key-not-for-production";
  const startupLogs = [];
  let server;

  try {
    const started = await startOperationalGateway({
      cwd: directory,
      env: {
        API_GATEWAY_STATE_FILE: stateFilePath,
        API_GATEWAY_ADMIN_KEY: adminKey,
        HOST: "127.0.0.1",
        PORT: "0",
      },
      logger: {
        log(line) {
          startupLogs.push(JSON.parse(line));
        },
      },
    });

    server = started.server;
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await getJson(baseUrl, "/health");
    assert.equal(health.response.status, 200);
    assert.deepEqual(health.body, {
      service: "api-gateway",
      status: "ok",
    });

    const readiness = await getJson(baseUrl, "/ready");
    assert.equal(readiness.response.status, 200);
    assert.equal(readiness.body.service, "api-gateway");
    assert.equal(readiness.body.status, "ready");
    assert.deepEqual(readiness.body.checks, [
      {
        name: "persistence",
        critical: true,
        status: "ok",
        code: "readable",
      },
    ]);

    const openApi = await getJson(baseUrl, "/openapi.json");
    assert.equal(openApi.response.status, 200);
    assert.equal(openApi.body.openapi, "3.1.0");
    assert.ok(openApi.body.paths["/health"]);
    assert.ok(openApi.body.paths["/ready"]);
    assert.ok(openApi.body.paths["/v1/whoami"]);

    const unauthorized = await getJson(baseUrl, "/v1/whoami");
    assert.equal(unauthorized.response.status, 401);
    assert.equal(unauthorized.body.error, "unauthorized");

    assert.equal(startupLogs.length, 1);
    assert.equal(startupLogs[0].event, "api_gateway_operational_started");
    assert.equal(startupLogs[0].mode, "operational");

    const serializedLogs = JSON.stringify(startupLogs);
    assert.equal(serializedLogs.includes(adminKey), false);
    assert.equal(serializedLogs.includes(directory), false);
    assert.equal(serializedLogs.includes(stateFilePath), false);

    return Object.freeze({
      status: "passed",
      checks: Object.freeze([
        "health",
        "readiness",
        "openapi",
        "authentication_boundary",
        "log_safety",
      ]),
    });
  } finally {
    await closeServer(server);
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const result = await runOperationalSmoke();
  console.log(
    JSON.stringify({
      event: "api_gateway_operational_smoke_passed",
      ...result,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        event: "api_gateway_operational_smoke_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
