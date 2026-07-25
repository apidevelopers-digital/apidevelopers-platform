import assert from "node:assert/strict";
import test from "node:test";

import pg from "pg";

import {
  applyPostgresMigrations,
  createPostgresMigrationPlan,
  createPostgresStore,
  rollbackPostgresMigrations,
} from "../src/index.mjs";

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;

function createPool() {
  return new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 5_000,
  });
}

test(
  "applies, records, rolls back and reapplies PostgreSQL migrations",
  { skip: !connectionString },
  async (t) => {
    const suffix = `${process.pid}`;
    const tableName = `apidev_migration_state_${suffix}`;
    const ledgerTableName = `apidev_migration_ledger_${suffix}`;
    const pool = createPool();

    t.after(async () => {
      await pool.query(`DROP TABLE IF EXISTS "public"."${tableName}"`);
      await pool.query(`DROP TABLE IF EXISTS "public"."${ledgerTableName}"`);
      await pool.end();
    });

    const plan = createPostgresMigrationPlan({
      tableName,
      ledgerTableName,
    });
    assert.equal(plan.latestVersion, 1);
    assert.equal(plan.migrations.length, 1);
    assert.equal(plan.migrations[0].checksum.length, 64);

    const firstApply = await applyPostgresMigrations({
      pool,
      tableName,
      ledgerTableName,
    });
    assert.deepEqual(firstApply.applied, [1]);
    assert.equal(firstApply.currentVersion, 1);

    const ledger = await pool.query(
      `SELECT version, name, checksum
FROM "public"."${ledgerTableName}"
ORDER BY version`,
    );
    assert.equal(ledger.rowCount, 1);
    assert.equal(Number(ledger.rows[0].version), 1);
    assert.equal(ledger.rows[0].name, "create_persistence_state");
    assert.equal(ledger.rows[0].checksum, plan.migrations[0].checksum);

    const store = createPostgresStore({
      pool,
      namespace: "migration_validation",
      tableName,
      ledgerTableName,
    });
    await store.initialize();
    const emptyState = await store.read();
    assert.equal(emptyState.revision, 0);

    const secondApply = await applyPostgresMigrations({
      pool,
      tableName,
      ledgerTableName,
    });
    assert.deepEqual(secondApply.applied, []);
    assert.equal(secondApply.currentVersion, 1);

    await assert.rejects(
      () =>
        rollbackPostgresMigrations({
          pool,
          tableName,
          ledgerTableName,
          targetVersion: 0,
        }),
      (error) =>
        error?.code === "postgres_migration_data_loss_not_authorized",
    );

    const rollback = await rollbackPostgresMigrations({
      pool,
      tableName,
      ledgerTableName,
      targetVersion: 0,
      allowDataLoss: true,
    });
    assert.deepEqual(rollback.rolledBack, [1]);
    assert.equal(rollback.currentVersion, 0);

    const tableAfterRollback = await pool.query(
      "SELECT to_regclass($1) AS relation",
      [`public.${tableName}`],
    );
    assert.equal(tableAfterRollback.rows[0].relation, null);

    const ledgerAfterRollback = await pool.query(
      `SELECT COUNT(*)::integer AS count
FROM "public"."${ledgerTableName}"`,
    );
    assert.equal(ledgerAfterRollback.rows[0].count, 0);

    const reapply = await applyPostgresMigrations({
      pool,
      tableName,
      ledgerTableName,
    });
    assert.deepEqual(reapply.applied, [1]);
    assert.equal(reapply.currentVersion, 1);

    const recoveredStore = createPostgresStore({
      pool,
      namespace: "migration_validation_after_reapply",
      tableName,
      ledgerTableName,
    });
    await recoveredStore.initialize();
    const recoveredState = await recoveredStore.read();
    assert.equal(recoveredState.revision, 0);
  },
);
