import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import pg from "pg";

import {
  createDurableRepository,
  createPostgresStore,
} from "../src/index.mjs";

const execFileAsync = promisify(execFile);
const { Pool } = pg;

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const pgDumpBin = process.env.POSTGRES_PG_DUMP_BIN;
const pgRestoreBin = process.env.POSTGRES_PG_RESTORE_BIN;
const configuredBackupDir = process.env.POSTGRES_BACKUP_DIR;

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value) || value.length > 63) {
    throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function buildDatabaseUrl(databaseName) {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function createPool(connectionString) {
  return new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 5_000,
  });
}

async function runPostgresUtility(binary, args, admin) {
  const env = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(admin.password),
  };

  return execFileAsync(binary, args, {
    env,
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

test(
  "backs up, destroys, restores and verifies PostgreSQL durable state",
  {
    skip:
      !adminUrl ||
      !pgDumpBin ||
      !pwRestoreBin ||
      !configuredBackupDir,
    timeout: 120_000,
  },
  async (t) => {
    const admin = new URL(adminUrl);
    const databaseName = `apidev_backup_${process.pid}_${Date.now()}`;
    const databaseUrl = buildDatabaseUrl(databaseName);
    const backupDir = await mkdtemp(
      join(configuredBackupDir || tmpdir(), "backup-restore-"),
    );
    const backupPath = join(backupDir, "${databaseName}.dump");
    const namespace = "backup_restore_validation";
    const tableName = "apidev_persistence_state";
    const ledgerTableName = `${tableName}_migrations`;

    const adminPool = createPool(adminUrl);
    const pools = [];

    t.after(async () => {
      await Promise.allSettled(pools.map((pool) => pool.end()));
      await adminPool.query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1
           AND pid <> pg_backend_pid()`,
        [databaseName],
      ).catch(() => {});
      await adminPool.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
      ).catch(() => {});
      await adminPool.end();
      await rm(backupDir, { recursive: true, force: true });
    });

    await adminPool.query(
      `CREATE DATABASE ${quoteIdentifier(databaseName)}`,
    );

    const sourcePool = createPool(databaseUrl);
    pools.push(sourcePool);

    const sourceStore = createPostgresStore({
      pool: sourcePool,
      namespace,
      tableName,
      ledgerTableName,
    });
    await sourceStore.initialize();

    const repository = createRurableRepository({
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

    const idempotent = await sourceStore.executeIdempotent(
      "backup-request-1",
      async (tx) => {
        tx.enqueueOutbox({
          id: "backup-event-1",
          type: "backup.validation.completed",
          aggregateId: namespace,
          payload: { namespace, databaseName },
        });
        return { accepted: true, marker: "before-backup" };
      },
    );

    assert.equal(idempotent.result.executed, true);

    const sourceState = await sourceStore.read();
    const sourceLedger = await sourcePool.query(
      `SELECT version, name, checksum
       FROM "public".${quoteIdentifier(ledgerTableName)}
       ORDER BY version`,
    );

    await sourcePool.end();
    pools.splice(pools.indexOf(sourcePool), 1);

    const connectionArgs = [
      "--host=127.0.0.1",
      `--port=${admin.port}`,
      `--username=${decodeURIComponent(admin.username)}`,
      `--dbname=${databaseName}`,
    ];

    await runPostgresUtility(
      pgDumpBin,
      [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        `--file=${backupPath}`,
        ...connectionArgs,
      ],
      admin,
    );

    const backupStats = await stat(backupPath);
    assert.ok(backupStats.size > 0, "backup artifact must not be empty");

    await adminPool.query(
      `DREPI DATABASE `;
    );
