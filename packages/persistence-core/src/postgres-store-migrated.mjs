import {
  buildPostgresSchemaSql,
  createPostgresStore as createLegacyPostgresStore,
} from "./postgres-store.mjs";
import { applyPostgresMigrations } from "./postgres-migrations.mjs";

export { buildPostgresSchemaSql };

export function createPostgresStore(options = {}) {
  const legacyStore = createLegacyPostgresStore(options);
  let initialization = null;

  async function initialize() {
    if (!initialization) {
      initialization = (async () => {
        await applyPostgresMigrations({
          pool: options.pool,
          schema: options.schema,
          tableName: options.tableName,
          ledgerTableName: options.ledgerTableName,
        });
        await legacyStore.initialize();
      })();
    }

    try {
      await initialization;
    } catch (error) {
      initialization = null;
      throw error;
    }
  }

  async function read() {
    await initialize();
    return legacyStore.read();
  }

  async function transaction(work, transactionOptions) {
    await initialize();
    return legacyStore.transaction(work, transactionOptions);
  }

  async function executeIdempotent(key, work) {
    await initialize();
    return legacyStore.executeIdempotent(key, work);
  }

  return Object.freeze({
    ...legacyStore,
    initialize,
    read,
    transaction,
    executeIdempotent,
  });
}
