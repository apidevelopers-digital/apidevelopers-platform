import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
    ["--test", "test/postgres-migrations.integration.test.mjs"],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        POSTGRES_TEST_URL: connectionString,
      },
      stdio: "inherit",
    },
  );

  const [code, signal] = await once(child, "exit");
  if (code !== 0) {
    throw new Error(
      `PostgreSQL migration integration test failed (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
    );
  }
}

const databaseDir = await mkdtemp(
  join(tmpdir(), "apidev-persistence-migrations-postgres-"),
);
const port = await reserveFreePort();
const user = "postgres";
const password = "ci-postgres";
const database = "apidev_persistence_migrations_test";

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
      console.error("Failed to stop embedded PostgreSQL cleanly.", error);
    });
  }

  await rm(databaseDir, { recursive: true, force: true });
}
