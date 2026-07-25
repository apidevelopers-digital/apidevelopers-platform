import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import pg from "pg";
import { createDurableRepository, createPostgresStore } from "../src/index.mjs";

const execFileAsync = promisify(execFile);
const { Pool } = pg;
const adminUrl = process.env.POSTGRES_ADMIN_URL;
const pgDump = process.env.POSTGRES_PG_DUMP_BIN;
const pgRestore = process.env.POSTGRES_PG_RESTORE_BIN;
const backupRoot = process.env.POSTGRES_BACKUP_DIR;

function ident(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value) || value.length > 63) {
    throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function pool(url) {
  return new Pool({
    connectionString: url,
    max: 4,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 5_000,
  });
}

async function utility(binary, args, password) {
  return execFileAsync(binary, args, {
    env: { ...process.env, PGPASSWORD: password },
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

test("backup, destruction, restore and durable-state verification", {
  skip: !adminUrl || !pgDump || !pgRestore || !backupRoot,
  timeout: 120_000,
}, async () => {
  const admin = new URL(adminUrl);
  const database = `apidev_backup_${process.pid}_${Date.now()}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${database}`;
  const backupDir = await mkdtemp(join(backupRoot, "restore-"));
  const backupFile = join(backupDir, `${database}.dump`);
  const table = "apidev_persistence_state";
  const ledger = `${table}_migrations`;
  const namespace = "backup_restore_validation";
  const adminPool = pool(adminUrl);
  let sourcePool;
  let restoredPool;

  try {
    await adminPool.query(`CREATE DATABASE ${ident(database)}`);
    sourcePool = pool(databaseUrl.toString());

    const sourceStore = createPostgresStore({
      pool: sourcePool,
      namespace,
      tableName: table,
      ledgerTableName: ledger,
    });
    await sourceStore.initialize();

    const repository = createDurableRepository({
      store: sourceStore,
      collection: "projects",
    });
    await repository.create({ id: "project-a", tenantId: "tenant-1", name: "Alpha" });
    await repository.create({ id: "project-b", tenantId: "tenant-1", name: "Beta" });

    const first = await sourceStore.executeIdempotent("backup-request-1", async (tx) => {
      tx.enqueueOutbox({
        id: "backup-event-1",
        type: "backup.validation.completed",
        aggregateId: namespace,
        payload: { namespace, database },
      });
      return { accepted: true, marker: "before-backup" };
    });
    assert.equal(first.result.executed, true);

    const sourceState = await sourceStore.read();
    const sourceLedger = await sourcePool.query(
      `SELECT version, name, checksum FROM "public".${ident(ledger)} ORDER BY version`,
    );

    await sourcePool.end();
    sourcePool = null;

    const connection = [
      "--host=127.0.0.1",
      `--port=${admin.port}`,
      `--username=${decodeURIComponent(admin.username)}`,
      `--dbname=${database}`,
    ];
    const password = decodeURIComponent(admin.password);

    await utility(pgDump, [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--file=${backupFile}`,
      ...connection,
    ], password);
    assert.ok((await stat(backupFile)).size > 0);

    await adminPool.query(`DROP DATABASE ${ident(database)}`);
    const destroyed = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database],
    );
    assert.equal(destroyed.rowCount, 0);

    await adminPool.query(`CREATE DATABASE ${ident(database)}`);
    await utility(pgRestore, [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      ...connection,
      backupFile,
    ], password);

    restoredPool = pool(databaseUrl.toString());
    const restoredStore = createPostgresStore({
      pool: restoredPool,
      namespace,
      tableName: table,
      ledgerTableName: ledger,
    });
    await restoredStore.initialize();

    const restoredRepository = createDurableRepository({
      store: restoredStore,
      collection: "projects",
    });
    const projects = await restoredRepository.list({ where: { tenantId: "tenant-1" } });
    assert.deepEqual(projects.map(({ id }) => id).sort(), ["project-a", "project-b"]);

    const replay = await restoredStore.executeIdempotent("backup-request-1", async () => {
      throw new Error("idempotent callback must not execute after restore");
    });
    assert.equal(replay.result.executed, false);
    assert.deepEqual(replay.result.value, { accepted: true, marker: "before-backup" });

    assert.deepEqual(await restoredStore.read(), sourceState);
    const restoredLedger = await restoredPool.query(
      `SELECT version, name, checksum FROM "public".${ident(ledger)} ORDER BY version`,
    );
    assert.deepEqual(restoredLedger.rows, sourceLedger.rows);
    assert.equal(restoredLedger.rowCount, 1);
  } finally {
    await Promise.allSettled([sourcePool?.end(), restoredPool?.end()]);
    await adminPool.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [database],
    ).catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${ident(database)}`).catch(() => {});
    await adminPool.end();
    await rm(backupDir, { recursive: true, force: true });
  }
});
