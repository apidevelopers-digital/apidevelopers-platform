import { createHash } from "node:crypto";

import { createHostingerSafeWriter } from "../../../packages/uni-operator-hostinger-adapter/src/hostinger-writer.mjs";

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function operationHash(operation) {
  return createHash("sha256").update(canonicalize(operation)).digest("hex");
}

function normalizeOperation(input = {}) {
  const { type, path, expectedSha256, backup = true } = input;
  if (!["writeBase64", "replaceText"].includes(type)) {
    throw new Error("invalid_operation_type");
  }
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error("path_required");
  }

  const base = { type, path, expectedSha256, backup: backup !== false };
  if (type === "writeBase64") {
    return {
      ...base,
      base64: input.base64,
      create: input.create === true,
    };
  }

  return {
    ...base,
    search: input.search,
    replacement: input.replacement,
    expectedOccurrences: input.expectedOccurrences ?? 1,
  };
}

export function createHostingerWriterRuntime({
  roots = [],
  enabled = false,
  approvalVerifier = async () => false,
  writerFactory = createHostingerSafeWriter,
} = {}) {
  const writer = writerFactory({ roots, enabled });

  async function prepare(input) {
    const operation = normalizeOperation(input);
    const hash = operationHash(operation);
    const result = operation.type === "writeBase64"
      ? await writer.writeBase64({ ...operation, dryRun: true })
      : await writer.replaceText({ ...operation, dryRun: true });

    return {
      ok: true,
      dryRun: true,
      operationHash: hash,
      result,
      approvalRequired: true,
      executable: enabled,
    };
  }

  async function execute(input, approval) {
    const operation = normalizeOperation(input);
    const hash = operationHash(operation);
    const approved = await approvalVerifier({
      operationHash: hash,
      approval,
      type: operation.type,
    });

    if (!approved) {
      throw new Error("approval_required_or_invalid");
    }

    const result = operation.type === "writeBase64"
      ? await writer.writeBase64({ ...operation, dryRun: false })
      : await writer.replaceText({ ...operation, dryRun: false });

    return {
      ok: true,
      dryRun: false,
      operationHash: hash,
      result,
    };
  }

  return {
    mode: enabled ? "write-enabled" : "disabled",
    capabilities: {
      prepare: true,
      execute: enabled,
      approvalRequired: true,
      operationHashBound: true,
      exposedHttpRoutes: false,
    },
    prepare,
    execute,
  };
}
