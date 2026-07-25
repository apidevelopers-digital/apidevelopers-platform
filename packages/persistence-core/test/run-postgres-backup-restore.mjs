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

async function runBackupRestoreTest(env) {
  const child = spawn(
    process.execPath,
    ["--test", "test/postgres-backup-restore.integration.test.mjs"],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdio: "inherit",
    },
  );

  const [code, signal] = await once(child, "exit");
  if (code !== 0) {
    throw new Error(
      `PostgreSQL logical backup/restore test failed (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
    );
  }
}

const databaseDir = await mkdtemp(
  join(tmpdir(), "apidev-persistence-backup-postgres-"),
);
const backupDir = await mkdtemp(
  join(tmpdir(), "apidev-persistence-backup-artifact-"),
);
const port = await reserveFreePort();
const user = "postgres";
const password = "ci-postgres";

const postgres = new EmbeddedPostgres({
  databaseDir,
  port,
  user,
  password,
  authMethod: "password",
  persistent: false,
  initdbFlags: ["--encoding=UTF8", "--no-locale"],
  onLog(message) {
    process.stdout.write(`[embedded-postgres ] ${String(message)}`);
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

  const adminUrl =
    `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}` +
    `@127.0.0.1:${port}/postgres`;

  await runBackupRestoreTest({
    POSTGRES_ADMIN_URL: adminUrl,
    POSTGRES_BACKUP_DIR: backupDir,
  });
} finally {
  if (started) {
    await postgres.stop().catch((error) => {
      console.error("Failed to stop embedded PostgreSQL cleanly.", error);
    });
  }

  await Promise.all([
    rm(databaseDir, { recursive: true, force: true }),
    rm(backupDir, { recursive: true, force: true }),
  ]);
}
