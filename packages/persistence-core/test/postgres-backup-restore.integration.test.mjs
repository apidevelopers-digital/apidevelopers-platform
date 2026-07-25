import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import pg from "pg";

import {
  createDurableRepository,
  createPostgresLogicalBackup,
  createPostgresStore,
  restorePostgresLogicalBackup,
  verifyPostgresLogicalBackup,
} from "../src/index.mjs";

const { Pool } = pg;
const adminUrl = process.env.POSTGRES_ADMIN_URL;
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

test("logical backup, destruction, restore and durable-state verification", {
  skip: !adminUrl || !backupRoot,
  timeout: 120_000,
}, async () => {
  const database = `apidev_backup_${process.pid}_${Date.now()}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${database}`;
  const backupDir = await mkdtemp(join(backupRoot, "restore-"));
  const backupFile = join(backupDir, `${database}.logical-backup.json`);
  const tableName = "apidev_persistence_state";
  const ledgerTableName = `${tableName}_migrations`;
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
      tableName,
      ledgerTableName,
    });
    await sourceStore.initialize();

    const repository = createDurableRepository({
      store: sourceStore,
      collection: "projects",
    });
    await repository.create({
      id: "project-a",
      tenantId: "tenant-1",
      name: "Alpha",
    });
    await repository.create({
      id: "project-b",
      tenantId: "tenant-1",
      name: "Beta",
    });

    const first = await sourceStore.executeIdempotent(
      "backup-request-1",
      async (tx) => {
        tx.enqueueOutbox({
          id: "backup-event-1",
          type: "backup.validation.completed",
          aggregateId: namespace,
          payload: { namespace, database },
        });
        return { accepted: true, marker: "before-backup" };
      },
    );
    assert.equal(first.result.executed, true);

    const sourceState = await sourceStore.read();
    const sourceLedger = await sourcePool.query(
      `SELECT version, name, checksum
FROM "public".${ident(ledgerTableName)}
ORDER BY version`,
    );

    const created = await createPostgresLogicalBackup({
      pool: sourcePool,
      path: backupFile,
      tableName,
      ledgerTableName,
    });
    assert.equal(created.stateRows, 1);
    assert.equal(created.migrations, 1);
    assert.equal(created.checksum.length, 64);
    assert.ok((await stat(backupFile)).size > 0);

    const verified = await verifyPostgresLogicalBackup({ path: backupFile });
    assert.equal(verified.checksum, created.checksum);
    assert.deepEqual(verified.source, {
      schema: "public",
      tableName,
      ledgerTableName,
    });

    await sourcePool.end();
    sourcePool = null;

    await adminPool.query(`DROP DATABASE ${ident(database)}`);
    const destroyed = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database],
    );
    assert.equal(destroyed.rowCount, 0);

    await adminPool.query(`CREATE DATABASE ${ident(database)}`);
    restoredPool = pool(databaseUrl.toString());

    await assert.rejects(
      () =>
        restorePostgresLogicalBackup({
          pool: restoredPool,
          path: backupFile,
        }),
      (error) =>
        error?.code === "postgres_logical_restore_data_loss_not_authorized",
    );

    const restored = await restorePostgresLogicalBackup({
      pool: restoredPool,
      path: backupFile,
      allowDataLoss: true,
    });
    assert.equal(restored.checksum, created.checksum);
    assert.equal(restored.restoredStateRows, 1);
    assert.equal(restored.restoredMigrations, 1);

    const restoredStore = createPostgresStore({
      pool: restoredPool,
      namespace,
      tableName,
      ledgerTableName,
    });
    await restoredStore.initialize();

    const restoredRepository = createDurableRepository({
      store: restoredStore,
      collection: "projects",
    });
    const projects = await restoredRepository.list({
      where: { tenantId: "tenant-1" },
    });
    assert.deepEqual(
      projects.map(({ id }) => id).sort(),
      ["project-a", "project-b"],
    );

    const replay = await restoredStore.executeIdempotent(
      "backup-request-1",
      async () => {
        throw new Error("idempotent callback must not execute after restore");
      },
    );
    assert.equal(replay.result.executed, false);
    assert.deepEqual(replay.result.value, {
      accepted: true,
      marker: "before-backup",
    });
    assert.deepEqual(await restoredStore.read(), sourceState);

    const restoredLedger = await restoredPool.query(
      `SELECT version, name, checksum
FROM "public".${ident(ledgerTableName)}
ORDER BY version`,
    );
    assert.deepEqual(restoredLedger.rows, sourceLedger.rows);
    assert.equal(restoredLedger.rowCount, 1);
  } finally {
    await Promise.allSettled([sourcePool?.end(), restoredPool?.end()]);
    await adminPool
      .query(
        `SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [database],
      )
      .catch(() => {});
    await adminPool
      .query(`DROP DATABASE IF EXISTS ${ident(database)}`)
      .catch(() => {});
    await adminPool.end();
    await rm(backupDir, { recursive: true, force: true });
  }
});
