import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const MAX_DIAGNOSTIC_CHARACTERS = 12_000;

function escapeWorkflowData(value) {
  return String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function annotateError(title, error) {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
    : String(error);
  process.stderr.write(
    `::error title=${escapeWorkflowData(title)}::${escapeWorkflowData(message)}\n`,
  );
}

function appendTail(current, chunk) {
  const next = `${current}${String(chunk)}`;
  return next.length > MAX_DIAGNOSTIC_CHARACTERS
    ? next.slice(-MAX_DIAGNOSTIC_CHARACTERS)
    : next;
}

async function reserveFreePort() {
  const server = net.createServer();
  server.unref();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve an ephemeral PostgreSQL port.");
  }

  const { port } = address;
  server.close();
  await once(server, "close");
  return port;
}

async function runTest(connectionString) {
  const child = spawn(
    process.execPath,
    ["--test", "test/postgres.integration.test.mjs"],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        POSTGRES_TEST_URL: connectionString,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdoutTail = "";
  let stderrTail = "";
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(chunk);
    stdoutTail = appendTail(stdoutTail, chunk);
  });
  child.stderr?.on("raw", (chunk) => {
    process.stderr.write(chunk);
    stderrTail = appendTail(stderrTail, chunk);
  });

  const [code, signal] = await once(child, "exit");
  if (code !== 0) {
    throw new Error(
      `PostgreSQL integration test failed (code=${code ?? "null"}, signal=${signal ?? "null"}).\n` +
      `:: child stdout tail ::\n${stdoutTail || "<empty>"}\n ` +
      `:: child stderr tail ::\n${stderrTail || "<empty>"}`,
    );
  }
}

async function main() {
  const uid = typeof process.getuid === "function" ? process.getuid() : "n/a";
  if (uid === 0) {
    throw new Error("PostgreSQL refuses to run as root.");
  }

  const databaseDir = await mkdtemp(
    join(tmpdir(), "apidev-persistence-postgres-"),
  );
  const port = await reserveFreePort();
  const user = "postgres";
  const password = "ci-postgres";
  const database = "apidev_persistence_test";

  process.stdout.write(
    `::notice title=Embedded PostgreSQL preflight::platform=${process.platform} arch=${process.arch} uid=${uid}\n`,
  );

  const postgres = new EmbeddedPostgres({
    databaseDir,
    port,
    user,
    password,
    authMethod: "password",
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--no-locale"],
    onLog(message) {
      process.stdout.write(`[embedded-postgres] ${String(message)}`);
    },
    onError(message) {
      process.stderr.write(`[embedded-postgres] ${String(message)}`);
    },
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

    await runTest(connectionString);
  } finally {
    if (started) {
      await postgres.stop().catch((error) => {
        annotateError("Embedded PostgreSQL cleanup failed", error);
      });
    }
    await rm(databaseDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  annotateError("Embedded PostgreSQL bootstrap failed", error);
  process.exitCode = 1;
});
