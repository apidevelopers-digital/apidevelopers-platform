import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { constants } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function escapeWorkflowData(value) {
  return String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function formatError(error) {
  if (error instanceof Error) {
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    return `${error.name}: ${error.message}\n${stdout}${stderr}\n${error.stack ?? ""}`;
  }
  return String(error);
}

function annotateError(title, error) {
  process.stderr.write(
    `::error title=${escapeWorkflowData(title)}::${escapeWorkflowData(formatError(error))}\n`,
  );
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

async function resolveBinaries() {
  if (process.platform !== "darwin") {
    throw new Error(`Unsupported CI platform: ${process.platform}`);
  }

  const packageName =
    process.arch === "arm64"
      ? "@embedded-postgres/darwin-arm64"
      : process.arch === "x64"
        ? "@embedded-postgres/darwin-x64"
        : null;

  if (!packageName) {
    throw new Error(`Unsupported macOS architecture: ${process.arch}`);
  }

  const binaries = await import(packageName);
  const binaryDir = dirname(binaries.postgres);
  const resolved = {
    postgres: binaries.postgres,
    initdb: binaries.initdb,
    pg_ctl: binaries.pg_ctl,
    pg_dump: join(binaryDir, "pg_dump"),
    pg_restore: join(binaryDir, "pg_restore"),
  };

  for (const [name, path] of Object.entries(resolved)) {
    await access(path, constants.X_OK);
    const { stdout, stderr } = await execFileAsync(path, ["--version"], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    process.stdout.write(`[preflight] ${name}: ${`${stdout}${stderr}`.trim()}\n`);
  }

  return { packageName, binaries: resolved };
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
      `PostgreSQL backup/restore integration test failed (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
    );
  }
}

async function main() {
  const uid = typeof process.getuid === "function" ? process.getuid() : "n/a";
  const { packageName, binaries } = await resolveBinaries();

  process.stdout.write(
    `::notice title=Embedded PostgreSQL backup preflight::platform=${process.platform} arch=${process.arch} uid=${uid} package=${packageName}\n`,
   );

  if (uid === 0) {
    throw new Error(
      "The self-hosted runner is executing as root. PostgreSQL refuses to run as root.",
    );
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

    const adminUrl =
      `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}` +
      `@127.0.0.1:${port}/postgres`;

    await runBackupRestoreTest({
      POSTGRES_ADMIN_URL: adminUrl,
      POSTGRES_PG_DUMP_BIN: binaries.pg_dump,
      POSTGRES_PG_RESTORE_BIN: binaries.pg_restore,
      POSTGRES_BACKUP_DIR: backupDir,
    });
  } finally {
    if (started) {
      await postgres.stop().catch((error) => {
        annotateError("Embedded PostgreSQL cleanup failed", error);
      });
    }

    await Promise.all([
      rm(databaseDir, { recursive: true, force: true }),
      rm(backupDir, { recursive: true, force: true }),
    ]);
  }
}

main().catch((error) => {
  annotateError("Embedded PostgreSQL backup bootstrap failed", error);
  process.exitCode = 1;
});
