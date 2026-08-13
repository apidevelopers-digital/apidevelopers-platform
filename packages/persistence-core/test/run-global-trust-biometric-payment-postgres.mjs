import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));
const testFiles = [
  join(repoRoot, "apps/api-gateway/test/global-trust-biometric-payment-postgres.integration.test.mjs"),
  join(repoRoot, "apps/api-gateway/test/global-trust-biometric-payment-postgres-runtime.integration.test.mjs"),
];
const MARKER = "GLOBAL_TRUST_PAYMENT_POSTGRES_DURABILITY_GATE_OK";

async function reserveFreePort() {
  const server = net.createServer();
  server.unref();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve PostgreSQL test port");
  const { port } = address;
  server.close();
  await once(server, "close");
  return port;
}

async function runTests(connectionString) {
  const child = spawn(process.execPath, ["--test", ...testFiles], {
    cwd: repoRoot,
    env: {
      ...process.env,
      POSTGRES_TEST_URL: connectionString,
      GLOBAL_TRUST_PAYMENT_MODE: "dry-run",
      GLOBAL_TRUST_PAYMENT_EGRESS: "blocked",
      GLOBAL_TRUST_REAL_MONEY: "disabled",
    },
    stdio: "inherit",
  });
  const [code, signal] = await once(child, "exit");
  if (code !== 0) {
    throw new Error(`Global Trust PostgreSQL durability tests failed (code=${code ?? "null"}, signal=${signal ?? "null"})`);
  }
}

async function main() {
  if (process.platform !== "darwin" || process.arch !== "x64") {
    throw new Error(`Unsupported CI platform: ${process.platform}/${process.arch}`);
  }
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    throw new Error("PostgreSQL integration cannot run as root");
  }

  const databaseDir = await mkdtemp(join(tmpdir(), "apidev-trust-payment-postgres-"));
  const port = await reserveFreePort();
  const user = "postgres";
  const password = "ci-postgres";
  const database = "apidev_trust_payment_test";

  const postgres = new EmbeddedPostgres({
    databaseDir,
    port,
    user,
    password,
    authMethod: "password",
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--no-locale"],
  });

  let started = false;
  try {
    await postgres.initialise();
    await postgres.start();
    started = true;
    await postgres.createDatabase(database);

    const connectionString =
      `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}` +
      `@127.0.0.1:${port}/${encodeURIComponent(database)}`;

    await runTests(connectionString);
    process.stdout.write(`${MARKER}\n`);
  } finally {
    if (started) await postgres.stop().catch(() => {});
    await rm(databaseDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`Global Trust PostgreSQL durability gate failed: ${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
