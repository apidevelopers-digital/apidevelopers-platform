import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  buildPostgresSchemaSql,
  createPostgresMigrationPlan,
} from "./postgres-migrations.mjs";

const FORMAT = "apidevelopers.persistence.postgres.logical-backup";
const VERSION = 1;

function requirePool(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("pool must provide connect");
  }
  return pool;
}

function requirePath(path) {
  if (typeof path !== "string" || path.trim().length === 0) {
    throw new TypeError("path must be a non-empty string");
  }
  return path;
}

function stable(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checksum(payload) {
  return createHash("sha256").update(stable(payload), "utf8").digest("hex");
}

function freeze(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freeze));
  }
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freeze(entry)]),
      ),
    );
  }
  return value;
}

function quoteIdentifier(value) {
  return `"${value}"`;
}

function qualify(schema, tableName) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`;
}

async function withClient(pool, work) {
  const client = await requirePool(pool).connect();
  try {
    return await work(client);
  } finally {
    client.release?.();
  }
}

function normalizeEnvelope(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("backup artifact must contain an object");
  }
  if (parsed.checksumAlgorithm !== "sha256") {
    throw new Error("unsupported backup checksum algorithm");
  }
  if (typeof parsed.checksum !== "string" || parsed.checksum.length !== 64) {
    throw new Error("backup checksum is invalid");
  }
  const payload = parsed.payload;
  if (!payload || payload.format !== FORMAT || payload.version !== VERSION) {
    throw new Error("unsupported PostgreSQL logical backup format");
  }
  const actual = checksum(payload);
  if (actual !== parsed.checksum) {
    const error = new Error("PostgreSQL logical backup checksum mismatch");
    error.code = "postgres_logical_backup_checksum_mismatch";
    throw error;
  }
  if (!Array.isArray(payload.stateRows) || !Array.isArray(payload.migrations)) {
    throw new Error("PostgreSQL logical backup rows are invalid");
  }
  return freeze(parsed);
}

async function readEnvelope(path) {
  const parsed = JSON.parse(await readFile(requirePath(path), "utf8"));
  return normalizeEnvelope(parsed);
}

export async function createPostgresLogicalBackup({
  pool,
  path,
  schema = "public",
  tableName = "apidev_persistence_state",
  ledgerTableName,
  createdAt = () => new Date().toISOString(),
} = {}) {
  const targetPath = requirePath(path);
  const plan = createPostgresMigrationPlan({
    schema,
    tableName,
    ledgerTableName,
  });
  const table = qualify(plan.schema, plan.tableName);

  const payload = await withClient(pool, async (client) => {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    try {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [plan.lockKey],
      );
      const stateResult = await client.query(
        `SELECT
  namespace,
  revision::text AS revision,
  payload,
  checksum,
  updated_at,
  created_at
FROM ${table}
ORDER BY namespace ASC`,
      );
      const migrationResult = await client.query(
        `SELECT
  version,
  name,
  checksum,
  applied_at
FROM ${plan.ledger}
ORDER BY version ASC`,
      );
      await client.query("COMMIT");

      return {
        format: FORMAT,
        version: VERSION,
        createdAt: (() => {
          const value = createdAt();
          return value instanceof Date ? value.toISOString() : String(value);
        })(),
        source: {
          schema: plan.schema,
          tableName: plan.tableName,
          ledgerTableName: plan.ledgerTableName,
        },
        stateRows: stateResult.rows ?? [],
        migrations: migrationResult.rows ?? [],
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });

  const envelope = {
    checksumAlgorithm: "sha256",
    checksum: checksum(payload),
    payload,
  };
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(dirname(targetPath), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(envelope, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }

  return freeze({
    path: targetPath,
    checksumAlgorithm: envelope.checksumAlgorithm,
    checksum: envelope.checksum,
    format: payload.format,
    version: payload.version,
    createdAt: payload.createdAt,
    stateRows: payload.stateRows.length,
    migrations: payload.migrations.length,
  });
}

export async function verifyPostgresLogicalBackup({ path } = {}) {
  const envelope = await readEnvelope(path);
  return freeze({
    path: requirePath(path),
    checksumAlgorithm: envelope.checksumAlgorithm,
    checksum: envelope.checksum,
    format: envelope.payload.format,
    version: envelope.payload.version,
    createdAt: envelope.payload.createdAt,
    stateRows: envelope.payload.stateRows.length,
    migrations: envelope.payload.migrations.length,
    source: envelope.payload.source,
  });
}

export async function restorePostgresLogicalBackup({
  pool,
  path,
  schema,
  tableName,
  ledgerTableName,
  allowDataLoss = false,
} = {}) {
  if (allowDataLoss !== true) {
    const error = new Error(
      "logical restore requires allowDataLoss: true because target rows are replaced",
    );
    error.code = "postgres_logical_restore_data_loss_not_authorized";
    throw error;
  }

  const envelope = await readEnvelope(path);
  const source = envelope.payload.source;
  const plan = createPostgresMigrationPlan({
    schema: schema ?? source.schema,
    tableName: tableName ?? source.tableName,
    ledgerTableName: ledgerTableName ?? source.ledgerTableName,
  });
  if (
    plan.schema !== source.schema ||
    plan.tableName !== source.tableName ||
    plan.ledgerTableName !== source.ledgerTableName
  ) {
    const error = new Error("logical backup target does not match artifact source");
    error.code = "postgres_logical_restore_target_mismatch";
    throw error;
  }

  const expectedMigrations = new Map(
    plan.migrations.map((migration) => [migration.version, migration]),
  );
  if (envelope.payload.migrations.length !== plan.migrations.length) {
    const error = new Error("logical backup migration set does not match current plan");
    error.code = "postgres_logical_restore_migration_mismatch";
    throw error;
  }
  for (const migration of envelope.payload.migrations) {
    const expected = expectedMigrations.get(Number(migration.version));
    if (
      !expected ||
      expected.name !== migration.name ||
      expected.checksum !== migration.checksum
    ) {
      const error = new Error(
        `logical backup migration ${migration.version} does not match current plan`,
      );
      error.code = "postgres_logical_restore_migration_mismatch";
      throw error;
    }
  }

  const table = qualify(plan.schema, plan.tableName);

  return withClient(pool, async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [plan.lockKey],
      );
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(plan.schema)}`);
      await client.query(plan.ledgerSql);
      await client.query(
        buildPostgresSchemaSql({
          schema: plan.schema,
          tableName: plan.tableName,
        }),
      );
      await client.query(`TRUNCATE TABLE ${table}, ${plan.ledger}`);

      for (const migration of envelope.payload.migrations) {
        await client.query(
          `INSERT INTO ${plan.ledger} (version, name, checksum, applied_at)
VALUES ($1, $2, $3, $4)`,
          [
            migration.version,
            migration.name,
            migration.checksum,
            migration.applied_at,
          ],
        );
      }

      for (const row of envelope.payload.stateRows) {
        await client.query(
          `INSERT INTO ${table}
(namespace, revision, payload, checksum, updated_at, created_at)
VALUES ($1, $2::bigint, $3::jsonb, $4, $5, $6)`,
          [
            row.namespace,
            row.revision,
            JSON.stringify(row.payload),
            row.checksum,
            row.updated_at,
            row.created_at,
          ],
        );
      }

      const stateCount = Number(
        (await client.query(`SELECT COUNT(*)::integer AS count FROM ${table}`))
          .rows[0].count,
      );
      const migrationCount = Number(
        (
          await client.query(
            `SELECT COUNT(*)::integer AS count FROM ${plan.ledger}`,
          )
        ).rows[0].count,
      );

      if (
        stateCount !== envelope.payload.stateRows.length ||
        migrationCount !== envelope.payload.migrations.length
      ) {
        throw new Error("logical restore row-count verification failed");
      }

      await client.query("COMMIT");
      return freeze({
        path: requirePath(path),
        checksum: envelope.checksum,
        restoredStateRows: stateCount,
        restoredMigrations: migrationCount,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}
