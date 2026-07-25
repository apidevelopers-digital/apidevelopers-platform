import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const FUNCTIONAL_MARKER = "PERSISTENCE_POSTGRES_FUNCTIONAL_GATE_OK";
const MAX_DIAGNOSTIC_CHARS = 12_000;

function escapeWorkflowData(value) {
  return String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function redact(value) {
  return String(value)
    .replaceAll("ci-postgres", "***")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, "postgresql://***");
}

function tail(value) {
  const text = String(value);
  return text.length > MAX_DIAGNOSTIC_CHARS
    ? text.slice(-MAX_DIAGNOSTIC_CHARS)
    : text;
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

async function runIntegrationTest(connectionString) {
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

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    stdout = tail(`${stdout}${String(chunk)}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    stderr = tail(`${stderr}${String(chunk)}`);
  });

  const [code, signal] = await once(child, "exit");
  if (code !== 0) {
    const diagnostic = redact(
      `code=${code ?? "null"} signal=${signal ?? "null"}\nstdout:\n${stdout || "<empty>"}\nstderr:\n${stderr || "<empty>"}`,
    );
    process.stderr.write(
      `::error title=${escapeWorkflowData("PostgreSQL functional integration failed")}::${escapeWorkflowData(diagnostic)}\n`,
    );
    throw new Error(
      `PostgreSQL integration test failed (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
    );
  }

  const evidence = [
    stdout.includes(FUNCTIONAL_MARKER),
    /# pass 1\b/u.test(stdout),
    /# fail 0\b/u.test(stdout),
    /# skipped 0\b/u.test(stdout),
  ];

  if (evidence.some((entry) => entry === false)) {
    throw new Error(
      "PostgreSQL integration exited successfully without complete functional evidence.",
    );
  }

  process.stdout.write(
    `[functional-gate] ${FUNCTIONAL_MARKER} pass=1 fail=0 skipped=0\n`,
  );
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error(`Unsupported CI platform: ${process.platform}`);
  }

  const uid =
    typeof process.getuid === "function" ? process.getuid() : "n/a";
  if (uid === 0) {
    throw new Error(
      "The self-hosted runner is executing as root. PostgreSQL refuses to run as root.",
    );
  }

  const databaseDir = await mkdtemp(
    join(tmpdir(), "apidev-persistence-postgres-"),
  );
  const port = await reserveFreePort();
  const user = "postgres";
  const password = "ci-postgres";
  const database = "apidev_persistence_test";

  process.stdout.write(
    `::notice title=Embedded PostgreSQL functional gate::platform=${process.platform} arch=${process.arch} uid=${uid}\n`,
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

    await runIntegrationTest(connectionString);
  } finally {
    if (started) {
      await postgres.stop().catch((error) => {
        process.stderr.write(
          `::error title=Embedded PostgreSQL cleanup failed::${escapeWorkflowData(redact(error?.stack ?? error))}\n`,
        );
      });
    }
    await rm(databaseDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `::error title=Embedded PostgreSQL bootstrap failed::${escapeWorkflowData(redact(error?.stack ?? error))}\n`,
  );
  process.exitCode = 1;
});
