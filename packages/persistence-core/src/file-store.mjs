import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  PersistenceDomainError,
  clone,
  createEmptyPersistenceState,
  decodePersistenceState,
  deepFreeze,
  encodePersistenceState,
  requireText,
} from "./model.mjs";
import { createTransactionContext, sleep } from "./transaction-context.mjs";

export function createJsonFileStore({
  filePath,
  clock = () => new Date().toISOString(),
  idFactory = randomUUID,
  fsync = true,
  lockRetryMs = 10,
  lockTimeoutMs = 2_000,
  staleLockMs = 30_000,
} = {}) {
  const normalizedPath = requireText(filePath, "filePath");
  const lockPath = `${normalizedPath}.lock`;
  let queue = Promise.resolve();

  async function initialize() {
    await mkdir(dirname(normalizedPath), { recursive: true });
  }

  async function readState() {
    await initialize();
    try {
      return decodePersistenceState(await readFile(normalizedPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") {
        return deepFreeze(createEmptyPersistenceState());
      }
      throw error;
    }
  }

  async function acquireLock() {
    const startedAt = Date.now();
    while (true) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, acquiredAt: clock() }),
          "utf8",
        );
        return handle;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;

        try {
          const lockStats = await stat(lockPath);
          if (Date.now() - lockStats.mtimeMs > staleLockMs) {
            await unlink(lockPath);
            continue;
          }
        } catch (statError) {
          if (statError?.code !== "ENOENT") throw statError;
          continue;
        }

        if (Date.now() - startedAt >= lockTimeoutMs) {
          throw new PersistenceDomainError(
            "persistence_lock_timeout",
            "timed out waiting for persistence lock",
            { details: { lockPath } },
          );
        }
        await sleep(lockRetryMs);
      }
    }
  }

  async function releaseLock(handle) {
    try {
      await handle.close();
    } finally {
      try {
        await unlink(lockPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }

  async function syncDirectory() {
    if (!fsync) return;
    let handle;
    try {
      handle = await open(dirname(normalizedPath), "r");
      await handle.sync();
    } catch (error) {
      if (!["EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(error?.code)) {
        throw error;
      }
    } finally {
      await handle?.close();
    }
  }

  async function writeState(state) {
    await initialize();
    const temporaryPath = `${normalizedPath}.${idFactory()}.tmp`;
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(encodePersistenceState(state), "utf8");
      if (fsync) await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await rename(temporaryPath, normalizedPath);
      await syncDirectory();
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch {
        // The rename may already have consumed the temporary file.
      }
      throw error;
    }
  }

  async function runTransaction(work, { expectedRevision } = {}) {
    if (typeof work !== "function") {
      throw new PersistenceDomainError(
        "invalid_argument",
        "transaction work must be a function",
      );
    }

    const lockHandle = await acquireLock();
    try {
      const current = await readState();
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
      await writeState(draft);
      return deepFreeze({
        result: result === undefined ? null : clone(result),
        revision: draft.revision,
      });
    } finally {
      await releaseLock(lockHandle);
    }
  }

  function transaction(work, options) {
    const operation = queue.then(
      () => runTransaction(work, options),
      () => runTransaction(work, options),
    );
    queue = operation.catch(() => undefined);
    return operation;
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
    kind: "json-file",
    filePath: normalizedPath,
    read: readState,
    transaction,
    executeIdempotent,
  });
}
