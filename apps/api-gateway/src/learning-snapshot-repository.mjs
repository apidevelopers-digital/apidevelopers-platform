import { readFile } from "node:fs/promises";

function assertSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Learning snapshot must be a JSON object.");
  }
  return value;
}

export function createJsonLearningSnapshotRepository({ filePath } = {}) {
  if (!filePath) {
    throw new TypeError("filePath is required");
  }

  return Object.freeze({
    kind: "json-file",
    async getLatest() {
      try {
        const content = await readFile(filePath, "utf8");
        return structuredClone(assertSnapshot(JSON.parse(content)));
      } catch (error) {
        if (error?.code === "ENOENT")
          return null;
        throw error;
      }
    },
  });
}
