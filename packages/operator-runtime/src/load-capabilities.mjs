import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveCapabilityPlan } from "./resolve-capabilities.mjs";

const DEFAULT_INDEX_PATH = path.resolve("generated/capabilities.index.json");

function parseIndex(raw, sourcePath) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid capability index at ${sourcePath}: ${message}`);
  }
}

export async function loadCapabilityIndex(indexPath = DEFAULT_INDEX_PATH) {
  const sourcePath = path.resolve(indexPath);
  let raw;

  try {
    raw = await readFile(sourcePath, "utf8");
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : undefined;
    if (code === "ENOENT") {
      throw new Error(
        `capability index not found at ${sourcePath}; run npm run registry:build first`,
      );
    }
    throw error;
  }

  const index = parseIndex(raw, sourcePath);

  if (!index || typeof index !== "object" || Array.isArray(index)) {
    throw new TypeError(`capability index at ${sourcePath} must be an object`);
  }

  return index;
}

export async function loadCapabilityPlan({
  indexPath = DEFAULT_INDEX_PATH,
  requestedIds = [],
} = {}) {
  const index = await loadCapabilityIndex(indexPath);
  return resolveCapabilityPlan(index, requestedIds);
}

export { DEFAULT_INDEX_PATH };
