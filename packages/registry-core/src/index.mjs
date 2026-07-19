const clone = (value) => structuredClone(value);

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeEntry(input, keyField) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("registry entry must be an object");
  }

  const entry = clone(input);
  entry[keyField] = requiredString(entry[keyField], keyField);
  entry.visibility = entry.visibility ?? "internal";
  entry.status = entry.status ?? "active";
  entry.tags = Array.isArray(entry.tags)
    ? [...new Set(entry.tags.map((tag) => requiredString(tag, "tag")))].sort()
    : [];

  return Object.freeze(entry);
}

function matches(entry, filters) {
  if (filters.visibility && entry.visibility !== filters.visibility) return false;
  if (filters.status && entry.status !== filters.status) return false;
  if (filters.tag && !entry.tags.includes(filters.tag)) return false;
  if (typeof filters.predicate === "function" && !filters.predicate(clone(entry))) return false;
  return true;
}

export class RegistryError extends Error {
  constructor(code, message, { status = 400, details } = {}) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function createRegistry({ entries = [], keyField = "id" } = {}) {
  requiredString(keyField, "keyField");
  const records = new Map();

  function register(input, { replace = false } = {}) {
    const entry = normalizeEntry(input, keyField);
    const key = entry[keyField];

    if (records.has(key) && !replace) {
      throw new RegistryError(
        "registry_entry_exists",
        `registry entry ${key} already exists`,
        { status: 409, details: { key } },
      );
    }

    records.set(key, entry);
    return clone(entry);
  }

  function registerMany(nextEntries, options) {
    if (!Array.isArray(nextEntries)) {
      throw new TypeError("entries must be an array");
    }
    return nextEntries.map((entry) => register(entry, options));
  }

  registerMany(entries);

  return Object.freeze({
    keyField,

    register,
    registerMany,

    get(key) {
      const entry = records.get(key);
      return entry ? clone(entry) : null;
    },

    has(key) {
      return records.has(key);
    },

    list(filters = {}) {
      return [...records.values()]
        .filter((entry) => matches(entry, filters))
        .map(clone)
        .sort((left, right) =>
          String(left[keyField]).localeCompare(String(right[keyField])),
        );
    },

    snapshot(filters = {}) {
      const items = this.list(filters);
      return Object.freeze({
        keyField,
        count: items.length,
        items,
      });
    },
  });
}
