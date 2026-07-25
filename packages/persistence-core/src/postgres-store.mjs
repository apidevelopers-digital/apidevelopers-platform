import {
  PERSISTENCE_FORMAT,
  PersistenceDomainError,
  checksum,
  clone,
  createEmptyPersistenceState,
  decodePersistenceState,
  deepFreeze,
  requireText,
} from "./model.mjs";
import { createTransactionContext } from "./transaction-context.mjs";

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function requireIdentifier(value, name) {
  const normalized = requireText(value, name);
  if (!SAFE_IDENTIFIER.test(normalized)) {
    throw new PersistenceDomainError(
      "invalid_postgres_identifier",
      `${name} must be a lowercase PostgreSQL identifier`,
      { details: { name } },
    );
  }
  return normalized;
}

function quoteIdentifier(value) {
  return `"${value}"`;
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

function parseRevision(value) {
  const revision = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new PersistenceDomainError(
      "invalid_persistence_state",
      "PostgreSQL revision is invalid",
      { details: { revision: String(value) } },
    );
  }
  return revision;
}

function decodeRow(row) {
  if (!row) return deepFreeze(createEmptyPersistenceState());
  const payload =
    typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return decodePersistenceState(
    JSON.stringify({
      format: PERSISTENCE_FORMAT,
      checksum: requireText(row.checksum, "checksum"),
      payload: {
        ...payload,
        revision: parseRevision(row.revision),
      },
    }),
  );
}

function mapPostgresError(error, namespace) {
  if (error instanceof PersistenceDomainError) return error;
  if (["40001", "40P01"].includes(error?.code)) {
    return new PersistenceDomainError(
      "persistence_retryable_conflict",
      "PostgreSQL transaction must be retried",
      {
        details: { namespace, postgresCode: error.code },
        cause: error,
      },
    );
  }
  if (error?.code === "23505") {
    return new PersistenceDomainError(
      "persistence_revision_conflict",
      "PostgreSQL persistence revision changed concurrently",
      {
        details: { namespace, postgresCode: error.code },
        cause: error,
      },
    );
  }
  return error;
}

export function buildPostgresSchemaSql({
  schema = "public",
  tableName = "apidev_persistence_state",
} = {}) {
  const normalizedSchema = requireIdentifier(schema, "schema");
  const normalizedTable = requireIdentifier(tableName, "tableName");
  const table = `${quoteIdentifier(normalizedSchema)}.${quoteIdentifier(normalizedTable)}`;
  return `CREATE TABLE IF NOT EXISTS ${table} (
  namespace TEXT PRIMARY KEY,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  payload JSONB NOT NULL,
  checksum CHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
}

export function createPostgresStore({
  pool,
  namespace = "default",
  schema = "public",
  tableName = "apidev_persistence_state",
  clock = () => new Date().toISOString(),
} = {}) {
  const normalizedPool = requirePool(pool);
  const normalizedNamespace = requireText(namespace, "namespace");
  const normalizedSchema = requireIdentifier(schema, "schema");
  const normalizedTable = requireIdentifier(tableName, "tableName");
  const table = `${quoteIdentifier(normalizedSchema)}.${quoteIdentifier(normalizedTable)}`;
  const schemaSql = buildPostgresSchemaSql({
    schema: normalizedSchema,
    tableName: normalizedTable,
  });
  const lockKey = `${normalizedSchema}.${normalizedTable}:${normalizedNamespace}`;
  let initialization = null;

  async function withClient(work) {
    const client = requireClient(await normalizedPool.connect());
    try {
      return await work(client);
    } finally {
      await client.release?.();
    }
  }

  async function initialize() {
    if (!initialization) {
      initialization = withClient((client) => client.query(schemaSql));
    }
    try {
      await initialization;
    } catch (error) {
      initialization = null;
      throw mapPostgresError(error, normalizedNamespace);
    }
  }

  async function selectState(client, { forUpdate = false } = {}) {
    const result = await client.query(
      `SELECT revision, payload, checksum, updated_at
FROM ${table}
WHERE namespace = $1${forUpdate ? "\nFOR UPDATE" : ""}`,
      [normalizedNamespace],
    );
    const row = result.rows?.[0] ?? null;
    return {
      exists: row !== null,
      state: decodeRow(row),
    };
  }

  async function read() {
    await initialize();
    return withClient(async (client) => (await selectState(client)).state);
  }

  async function transaction(work, { expectedRevision } = {}) {
    if (typeof work !== "function") {
      throw new PersistenceDomainError(
        "invalid_argument",
        "transaction work must be a function",
      );
    }
    await initialize();

    return withClient(async (client) => {
      let began = false;
      try {
        await client.query("BEGIN");
        began = true;
        await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextended($1, 0))",
          [lockKey],
        );

        const selected = await selectState(client, { forUpdate: true });
        const current = selected.state;
        if (
          expectedRevision !== undefined &&
          current.revision !== expectedRevision
        ) {
          throw new PersistenceDomainError(
            "persistence_revision_conflict",
            "persistence revision does not match expectation",
            {
              details: {
                expectedRevision,
                actualRevision: current.revision,
              },
            },
          );
        }

        const draft = clone(current);
        const tx = createTransactionContext(draft, clock);
        const result = await work(tx);
        draft.revision = current.revision + 1;
        draft.updatedAt = clock();
        const digest = checksum(draft);
        const payload = JSON.stringify(draft);

        let persisted;
        if (!selected.exists) {
          persisted = await client.query(
            `INSERT INTO ${table}
(namespace, revision, payload, checksum, updated_at)
VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz)
RETURNING revision`,
            [
              normalizedNamespace,
              draft.revision,
              payload,
              digest,
              draft.updatedAt,
            ],
          );
        } else {
          persisted = await client.query(
            `UPDATE ${table}
SET revision = $2,
    payload = $3::jsonb,
    checksum = $4,
    updated_at = $5::timestamptz
WHERE namespace = $1
  AND revision = $6
RETURNING revision`,
            [
              normalizedNamespace,
              draft.revision,
              payload,
              digest,
              draft.updatedAt,
              current.revision,
            ],
          );
        }

        if (persisted.rowCount !== 1) {
          throw new PersistenceDomainError(
            "persistence_revision_conflict",
            "persistence revision changed concurrently",
            {
              details: {
                expectedRevision: current.revision,
              },
            },
          );
        }

        await client.query("COMMIT");
        began = false;
        return deepFreeze({
          result: result === undefined ? null : clone(result),
          revision: draft.revision,
        });
      } catch (error) {
        if (began) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Preserve the original transaction error.
          }
        }
        throw mapPostgresError(error, normalizedNamespace);
      }
    });
  }

  async function executeIdempotent(key, work) {
    const normalizedKey = requireText(key, "idempotencyKey");
    return transaction(async (tx) => {
      const existing = tx.getIdempotency(normalizedKey);
      if (existing) {
        return {
          executed: false,
          value: existing.value,
        };
      }
      const value = await work(tx);
      tx.putIdempotency(normalizedKey, value);
      return {
        executed: true,
        value,
      };
    });
  }

  return Object.freeze({
    kind: "postgres",
    namespace: normalizedNamespace,
    schema: normalizedSchema,
    tableName: normalizedTable,
    initialize,
    read,
    transaction,
    executeIdempotent,
  });
}
