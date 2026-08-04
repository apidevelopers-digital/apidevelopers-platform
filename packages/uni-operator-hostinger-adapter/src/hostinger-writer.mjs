import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const SHA256_RE = /^[a-f0-9]{64}$/i;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function isInsideRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function countOccurrences(source, search) {
  if (search === "") return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(search, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + search.length;
  }
}

function validateBase64(value) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) {
    throw new Error("base64_invalid");
  }
  if (!BASE64_RE.test(value)) {
    throw new Error("base64_invalid");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error("base64_invalid");
  }
  return decoded;
}

function assertExpectedSha(expectedSha256) {
  if (typeof expectedSha256 !== "string" || !SHA256_RE.test(expectedSha256)) {
    throw new Error("expected_sha256_required");
  }
}

function assertNoSecrets(buffer) {
  const text = buffer.toString("utf8");
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\b(?:api[_-]?key|token|password|passwd|secret)\s*[:=]\s*["']?[A-Za-z0-9_\-/.+=]{16,}/i,
    /\bBearer\s+[A-Za-z0-9_\-/.+=]{20,}/i,
    /\bDATABASE_URL\s*=\s*\S+/i,
  ];
  if (patterns.some((pattern) => pattern.test(text))) {
    throw new Error("secret_like_content_blocked");
  }
}

async function exists(filePath, fsApi) {
  try {
    await fsApi.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeResultPath(filePath) {
  return path.basename(filePath);
}

export function createHostingerSafeWriter({
  roots = [],
  enabled = false,
  fsApi = { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile },
  now = () => new Date(),
} = {}) {
  const normalizedRoots = roots.map((root) => path.resolve(root));

  function resolveAllowedPath(inputPath) {
    if (typeof inputPath !== "string" || inputPath.trim() === "") {
      throw new Error("path_required");
    }
    const resolved = path.resolve(inputPath);
    if (!normalizedRoots.some((root) => isInsideRoot(resolved, root))) {
      throw new Error("path_not_allowed");
    }
    return resolved;
  }

  function assertEnabled() {
    if (!enabled) {
      throw new Error("writer_disabled");
    }
  }

  async function currentState(filePath) {
    const present = await exists(filePath, fsApi);
    if (!present) {
      return {
        exists: false,
        buffer: Buffer.alloc(0),
        sha256: sha256(Buffer.alloc(0)),
        size: 0,
      };
    }
    const buffer = await fsApi.readFile(filePath);
    return {
      exists: true,
      buffer,
      sha256: sha256(buffer),
      size: buffer.length,
    };
  }

  async function applyAtomicWrite({
    filePath,
    nextBuffer,
    expectedSha256,
    dryRun,
    create,
    backup,
  }) {
    const before = await currentState(filePath);

    if (before.exists) {
      assertExpectedSha(expectedSha256);
      if (before.sha256 !== expectedSha256.toLowerCase()) {
        throw new Error("sha256_mismatch");
      }
    } else if (!create) {
      throw new Error("target_missing");
    }

    assertNoSecrets(nextBuffer);
    const afterSha256 = sha256(nextBuffer);

    const result = {
      ok: true,
      dryRun,
      path: sanitizeResultPath(filePath),
      existed: before.exists,
      beforeSha256: before.sha256,
      afterSha256,
      beforeSize: before.size,
      afterSize: nextBuffer.length,
      backupCreated: false,
      backupPath: null,
      atomic: true,
      rolledBack: false,
    };

    if (dryRun) {
      return result;
    }

    await fsApi.mkdir(path.dirname(filePath), { recursive: true });

    const stamp = now().toISOString().replace(/[:.]/g, "-");
    const tempPath = `${filePath}.tmp-${process.pid}-${stamp}`;
    const backupPath = `${filePath}.bak-${stamp}`;

    try {
      if (before.exists && backup) {
        await fsApi.copyFile(filePath, backupPath);
        result.backupCreated = true;
        result.backupPath = sanitizeResultPath(backupPath);
      }

      await fsApi.writeFile(tempPath, nextBuffer, { flag: "wx" });
      await fsApi.rename(tempPath, filePath);
      return result;
    } catch (error) {
      await fsApi.rm(tempPath, { force: true }).catch(() => undefined);

      if (before.exists && result.backupCreated) {
        try {
          await fsApi.copyFile(backupPath, filePath);
          result.rolledBack = true;
        } catch {
          // Preserve the original failure. Rollback status remains false.
        }
      } else if (!before.exists) {
        await fsApi.rm(filePath, { force: true }).catch(() => undefined);
      }

      const wrapped = new Error("atomic_write_failed");
      wrapped.cause = error;
      wrapped.result = result;
      throw wrapped;
    }
  }

  async function writeBase64({
    path: inputPath,
    base64,
    expectedSha256,
    dryRun = true,
    create = false,
    backup = true,
  } = {}) {
    assertEnabled();
    const filePath = resolveAllowedPath(inputPath);
    const nextBuffer = validateBase64(base64);

    return applyAtomicWrite({
      filePath,
      nextBuffer,
      expectedSha256,
      dryRun: dryRun !== false,
      create: create === true,
      backup: backup !== false,
    });
  }

  async function replaceText({
    path: inputPath,
    search,
    replacement,
    expectedSha256,
    expectedOccurrences = 1,
    dryRun = true,
    backup = true,
  } = {}) {
    assertEnabled();
    const filePath = resolveAllowedPath(inputPath);

    if (typeof search !== "string" || search === "") {
      throw new Error("search_required");
    }
    if (typeof replacement !== "string") {
      throw new Error("replacement_required");
    }
    if (!Number.isInteger(expectedOccurrences) || expectedOccurrences < 1) {
      throw new Error("expected_occurrences_invalid");
    }

    const before = await currentState(filePath);
    if (!before.exists) {
      throw new Error("target_missing");
    }

    assertExpectedSha(expectedSha256);
    if (before.sha256 !== expectedSha256.toLowerCase()) {
      throw new Error("sha256_mismatch");
    }

    const source = before.buffer.toString("utf8");
    const occurrences = countOccurrences(source, search);
    if (occurrences !== expectedOccurrences) {
      throw new Error("occurrence_count_mismatch");
    }

    const nextText = source.replace(search, replacement);
    const nextBuffer = Buffer.from(nextText, "utf8");
    const result = await applyAtomicWrite({
      filePath,
      nextBuffer,
      expectedSha256,
      dryRun: dryRun !== false,
      create: false,
      backup: backup !== false,
    });

    return {
      ...result,
      occurrences,
      changed: result.beforeSha256 !== result.afterSha256,
      diff: {
        removedBytes: Buffer.byteLength(search, "utf8"),
        addedBytes: Buffer.byteLength(replacement, "utf8"),
      },
    };
  }

  return {
    mode: enabled ? "write-enabled" : "disabled",
    capabilities: {
      writeBase64: enabled,
      replaceText: enabled,
      dryRunDefault: true,
      expectedSha256Required: true,
      atomicWrite: true,
      backup: true,
      rollback: true,
      secretLikeContentBlocked: true,
    },
    writeBase64,
    replaceText,
  };
}
