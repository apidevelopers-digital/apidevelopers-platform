import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const CLIENT_STORE_SCHEMA_VERSION = 2;

function clone(value) {
  return structuredClone(value);
}

function emptyState() {
  return {
    schemaVersion: CLIENT_STORE_SCHEMA_VERSION,
    clients: [],
  };
}

function validateState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("client repository state must be an object");
  }

  if (state.schemaVersion !== CLIENT_STORE_SCHEMA_VERSION) {
    throw new Error(
      `unsupported client repository schema version: ${state.schemaVersion}`,
    );
  }

  if (!Array.isArray(state.clients)) {
    throw new TypeError("client repository state.clients must be an array");
  }

  return state;
}

export function createMemoryClientRepository({ initialState } = {}) {
  let state = clone(initialState ?? emptyState());

  return Object.freeze({
    kind: "memory",

    load() {
      return clone(state);
    },

    save(nextState) {
      state = clone(validateState(nextState));
    },
  });
}

export function createJsonFileClientRepository({
  filePath,
  initialState,
} = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new TypeError("filePath must be a non-empty string");
  }

  const absolutePath = resolve(filePath);

  function load() {
    if (!existsSync(absolutePath)) {
      return clone(initialState ?? emptyState());
    }

    const raw = readFileSync(absolutePath, "utf8");
    if (raw.trim() === "") return emptyState();
    return clone(JSON.parse(raw));
  }

  function save(nextState) {
    const state = clone(validateState(nextState));
    mkdirSync(dirname(absolutePath), { recursive: true });

    const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporaryPath, absolutePath);

    try {
      chmodSync(absolutePath, 0o600);
    } catch {
      // Some filesystems do not support POSIX permissions.
    }
  }

  return Object.freeze({
    kind: "json-file",
    filePath: absolutePath,
    load,
    save,
  });
}
