import { createHash } from "node:crypto";

import {
  PersistenceDomainError,
  requireText,
} from "./model.mjs";

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const DEFAULT_SCHEMA = "public";
const DEFAULT_TABLE = "apidev_persistence_state";

function requireIdentifier(value, name) {
  const normalized = requireText(value, name);
  if (!SAFE_IDENTIFIER.test(normalized) || normalized.length > 63) {
    throw new PersistenceDomainError(
      "invalid_postgres_identifier",
      `${name} must be a lowercase PostgreSQL identifier with at most 63 characters`,
      { details: { name } },
    );
  }
  return normalized;
}

function quoteIdentifier(value) {
  return `"${value}"`;
}

function qualify(schema, tableName) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`;
}

function checksumMigration(migration) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: migration.version,
        name: migration.name,
        up: migration.up,
        down: migration.down,
      }),
      "utf8",
    )
    .digest("hex");
}

function requirePool(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new PersistenceDomainError(
      "invalid_store",
      "pool must provide connect",
    );
  }
  return pool;
}

function requireClient(client) {
  if (!client || typeof client.query !== "function") {
    throw new PersistenceDomainError(
      "invalid_store",
      "PostgreSQL client must provide query",
    );
  }
  return client;
}

function normalizeTargetVersion(value, latestVersion) {
  const normalized = Number(value);
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < 0 ||
    normalized > latestVersion
  ) {
    throw new PersistenceDomainError(
      "invalid_migration_target",
      `targetVersion must be an integer between 0 and ${latestVersion}`,
      { details: { targetVersion: value, latestVersion } },
    );
  }
  return normalized;
}

async function withClient(pool, work) {
  const client = requireClient(await requirePool(pool).connect());
  try {
    return await work(client);
  } finally {
    await client.release?.();
  }
}

async function withMigrationTransaction(client, lockKey, work) {
  let began = false;
  try {
    await client.query("BEGIN");
    began = true;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [lockKey],
    );
    const result = await work();
    await client.query("COMMIT");
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original migration error.
      }
    }
    throw error;
  }
}

function buildLedgerSql({ schema, ledgerTableName }) {
  const ledger = qualify(schema, ledgerTableName);
  return `CREATE TABLE IF NOT EXISTS ${ledger} (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
}

export function buildPostgresSchemaSql({
  schema = DEFAULT_SCHEMA,
  tableName = DEFAULT_TABLE,
} = {}) {
  const normalizedSchema = requireIdentifier(schema, "schema");
  const normalizedTable = requireIdentifier(tableName, "tableName");
  const table = qualify(normalizedSchema, normalizedTable);

  return `CREATE TABLE IF NOT EXISTS ${table} (
  namespace TEXT PRIMARY KEY,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  payload JSONB NOT NULL,
  checksum CHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
}

export function createPostgresMigrationPlan({
  schema = DEFAULT_SCHEMA,
  tableName = DEFAULT_TABLE,
  ledgerTableName,
} = {}) {
  const normalizedSchema = requireIdentifier(schema, "schema");
  const normalizedTable = requireIdentifier(tableName, "tableName");
  const normalizedLedgerTable = requireIdentifier(
    ledgerTableName ?? `${normalizedTable}_migrations`,
    "ledgerTableName",
  );
  const table = qualify(normalizedSchema, normalizedTable);

  const migrations = [
    {
      version: 1,
      name: "create_persistence_state",
      up: buildPostgresSchemaSql({
        schema: normalizedSchema,
        tableName: normalizedTable,
      }),
      down: `DROP TABLE IF EXISTS ${table}`,
    },
  ].map((migration) =>
    Object.freeze({
      ...migration,
      checksum: checksumMigration(migration),
    }),
  );

  return Object.freeze({
    schema: normalizedSchema,
    tableName: normalizedTable,
    ledgerTableName: normalizedLedgerTable,
    ledgerSql: buildLedgerSql({
      schema: normalizedSchema,
      ledgerTableName: normalizedLedgerTable,
    }),
    ledger: qualify(normalizedSchema, normalizedLedgerTable),
    lockKey: `${normalizedSchema}.${normalizedLedgerTable}`,
    latestVersion: migrations.at(-1)?.version ?? 0,
    migrations: Object.freeze(migrations),
  });
}

function verifyAppliedMigrations(rows, plan) {
  const known = new Map(
    plan.migrations.map((migration) => [migration.version, migration]),
  );

  for (const row of rows) {
    const version = Number(row.version);
    const migration = known.get(version);
    if (!migration) {
      throw new PersistenceDomainError(
        "unknown_postgres_migration",
        `database contains unknown PostgreSQL migration version ${version}`,
        { details: { version } },
      );
    }
    if (String(row.name) !== migration.name) {
      throw new PersistenceDomainError(
        "postgres_migration_name_mismatch",
        `PostgreSQL migration ${version} name does not match`,
        {
          details: {
            version,
            expected: migration.name,
            actual: String(row.name),
          },
        },
      );
    }
    if (String(row.checksum) !== migration.checksum) {
      throw new PersistenceDomainError(
        "postgres_migration_checksum_mismatch",
        `PostgreSQL migration ${version} checksum does not match`,
        { details: { version } },
      );
    }
  }
}

async function readAppliedMigrations(client, plan) {
  const result = await client.query(
    `SELECT version, name, checksum, applied_at
FROM ${plan.ledger}
ORDER BY version ASC`,
  );
  verifyAppliedMigrations(result.rows ?? [], plan);
  return result.rows ?? [];
}

export async function applyPostgresMigrations({
  pool,
  schema = DEFAULT_SCHEMA,
  tableName = DEFAULT_TABLE,
  ledgerTableName,
} = {}) {
  const plan = createPostgresMigrationPlan({
    schema,
    tableName,
    ledgerTableName,
  });

  return withClient(pool, (client) =>
    withMigrationTransaction(client, plan.lockKey, async () => {
      await client.query(plan.ledgerSql);
      const appliedRows = await readAppliedMigrations(client, plan);
      const appliedVersions = new Set(
        appliedRows.map((row) => Number(row.version)),
      );
      const applied = [];

      for (const migration of plan.migrations) {
        if (appliedVersions.has(migration.version)) continue;

        await client.query(migration.up);
        await client.query(
          `INSERT INTO ${plan.ledger} (version, name, checksum)
VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum],
        );
        applied.push(migration.version);
      }

      return Object.freeze({
        applied: Object.freeze(applied),
        currentVersion: plan.latestVersion,
        latestVersion: plan.latestVersion,
      });
    }),
  );
}

export async function rollbackPostgresMigrations({
  pool,
  schema = DEFAULT_SCHEMA,
  tableName = DEFAULT_TABLE,
  ledgerTableName,
  targetVersion = 0,
  allowDataLoss = false,
} = {}) {
  const plan = createPostgresMigrationPlan({
    schema,
    tableName,
    ledgerTableName,
  });
  const normalizedTarget = normalizeTargetVersion(
    targetVersion,
    plan.latestVersion,
  );

  return withClient(pool, (client) =>
    withMigrationTransaction(client, plan.lockKey, async () => {
      await client.query(plan.ledgerSql);
      const appliedRows = await readAppliedMigrations(client, plan);
      const appliedVersions = new Set(
        appliedRows.map((row) => Number(row.version)),
      );
      const pendingRollbacks = [...plan.migrations]
        .reverse()
        .filter(
          (migration) =>
            migration.version > normalizedTarget &&
            appliedVersions.has(migration.version),
        );

      if (pendingRollbacks.length > 0 && allowDataLoss !== true) {
        throw new PersistenceDomainError(
          "postgres_migration_data_loss_not_authorized",
          "rollback requires allowDataLoss: true",
          {
            details: {
              targetVersion: normalizedTarget,
              latestVersion: plan.latestVersion,
              pendingVersions: pendingRollbacks.map(
                (migration) => migration.version,
              ),
            },
          },
        );
      }

      const rolledBack = [];

      for (const migration of pendingRollbacks) {
        await client.query(migration.down);
        await client.query(
          `DELETE FROM ${plan.ledger} WHERE version = $1`,
          [migration.version],
        );
        rolledBack.push(migration.version);
      }

      const remaining = plan.migrations
        .map((migration) => migration.version)
        .filter(
          (version) =>
            version <= normalizedTarget && appliedVersions.has(version),
        );

      return Object.freeze({
        rolledBack: Object.freeze(rolledBack),
        currentVersion: remaining.at(-1) ?? 0,
        latestVersion: plan.latestVersion,
      });
    }),
  );
}
