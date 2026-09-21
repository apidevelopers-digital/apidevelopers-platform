import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_SECRET_BYTES = 16 * 1024;

function nowMs(clock) {
  return Number(clock());
}

function hashToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest();
}

function safeEqualHash(expected, candidate) {
  const actual = hashToken(candidate);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicStatus(record, now) {
  const expired = now >= record.expiresAtMs;
  const state =
    record.state === "consumed" ? "consumed" :
    expired ? "expired" :
    record.state;

  return Object.freeze({
    sessionId: record.sessionId,
    purpose: record.purpose,
    state,
    createdAt: new Date(record.createdAtMs).toISOString(),
    expiresAt: new Date(record.expiresAtMs).toISOString(),
    secretPresent: state === "secret_received",
    consumedAt: record.consumedAtMs ? new Date(record.consumedAtMs).toISOString() : null,
  });
}

function wipe(buffer) {
  if (Buffer.isBuffer(buffer)) buffer.fill(0);
}

export function createSecretHandoffService({
  ttlMs = DEFAULT_TTL_MS,
  maxSecretBytes = MAX_SECRET_BYTES,
  clock = () => Date.now(),
  idFactory = () => randomUUID(),
  tokenFactory = () => randomBytes(32).toString("base64url"),
} = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs < 1000 || ttlMs > 15 * 60 * 1000) {
    throw new TypeError("secret_handoff_ttl_invalid");
  }
  if (!Number.isInteger(maxSecretBytes) || maxSecretBytes < 1 || maxSecretBytes > 64 * 1024) {
    throw new TypeError("secret_handoff_max_secret_bytes_invalid");
  }

  const sessions = new Map();

  function getRecord(sessionId) {
    const id = String(sessionId ?? "").trim();
    if (!id) return null;
    return sessions.get(id) ?? null;
  }

  function expireIfNeeded(record) {
    const now = nowMs(clock);
    if (record.state !== "consumed" && now >= record.expiresAtMs) {
      wipe(record.secretBuffer);
      record.secretBuffer = null;
      record.state = "expired";
    }
    return now;
  }

  return Object.freeze({
    create({ purpose, metadata = {} } = {}) {
      const cleanPurpose = String(purpose ?? "").trim();
      if (!cleanPurpose) throw new TypeError("secret_handoff_purpose_required");

      const sessionId = idFactory();
      const submitToken = tokenFactory();
      const createdAtMs = nowMs(clock);
      const expiresAtMs = createdAtMs + ttlMs;

      sessions.set(sessionId, {
        sessionId,
        purpose: cleanPurpose,
        metadata: Object.freeze({ ...metadata }),
        tokenHash: hashToken(submitToken),
        createdAtMs,
        expiresAtMs,
        state: "waiting_secret",
        secretBuffer: null,
        consumedAtMs: null,
      });

      return Object.freeze({
        sessionId,
        submitToken,
        state: "waiting_secret",
        expiresAt: new Date(expiresAtMs).toISOString(),
      });
    },

    status(sessionId) {
      const record = getRecord(sessionId);
      if (!record) return Object.freeze({ found: false, state: "not_found" });
      const now = expireIfNeeded(record);
      return Object.freeze({ found: true, ...publicStatus(record, now) });
    },

    submit({ sessionId, submitToken, secret } = {}) {
      const record = getRecord(sessionId);
      if (!record) return Object.freeze({ ok: false, code: "secret_handoff_not_found" });

      expireIfNeeded(record);
      if (record.state === "expired") return Object.freeze({ ok: false, code: "secret_handoff_expired" });
      if (record.state === "consumed") return Object.freeze({ ok: false, code: "secret_handoff_consumed" });
      if (record.state === "secret_received") return Object.freeze({ ok: false, code: "secret_handoff_already_submitted" });
      if (!safeEqualHash(record.tokenHash, submitToken ?? "")) {
        return Object.freeze({ ok: false, code: "secret_handoff_token_invalid" });
      }

      if (typeof secret !== "string" || secret.length === 0) {
        return Object.freeze({ ok: false, code: "secret_handoff_secret_required" });
      }

      const bytes = Buffer.byteLength(secret, "utf8");
      if (bytes > maxSecretBytes) {
        return Object.freeze({ ok: false, code: "secret_handoff_secret_too_large" });
      }

      record.secretBuffer = Buffer.from(secret, "utf8");
      record.state = "secret_received";

      return Object.freeze({
        ok: true,
        sessionId: record.sessionId,
        state: "secret_received",
        expiresAt: new Date(record.expiresAtMs).toISOString(),
      });
    },

    async consume({ sessionId, consumer } = {}) {
      const record = getRecord(sessionId);
      if (!record) return Object.freeze({ ok: false, code: "secret_handoff_not_found" });

      expireIfNeeded(record);
      if (record.state === "expired") return Object.freeze({ ok: false, code: "secret_handoff_expired" });
      if (record.state === "consumed") return Object.freeze({ ok: false, code: "secret_handoff_consumed" });
      if (record.state !== "secret_received" || !Buffer.isBuffer(record.secretBuffer)) {
        return Object.freeze({ ok: false, code: "secret_handoff_secret_missing" });
      }
      if (typeof consumer !== "function") {
        throw new TypeError("secret_handoff_consumer_required");
      }

      const secretBuffer = record.secretBuffer;
      record.secretBuffer = null;
      record.state = "consuming";

      try {
        const leaseBytes = Buffer.from(secretBuffer);
        try {
          const result = await consumer(leaseBytes, Object.freeze({
            sessionId: record.sessionId,
            purpose: record.purpose,
            metadata: record.metadata,
          }));

          return Object.freeze({
            ok: true,
            sessionId: record.sessionId,
            state: "consumed",
            result,
          });
        } finally {
          wipe(leaseBytes);
        }
      } finally {
        wipe(secretBuffer);
        record.state = "consumed";
        record.consumedAtMs = nowMs(clock);
      }
    },

    purgeExpired() {
      const now = nowMs(clock);
      let purged = 0;
      for (const [sessionId, record] of sessions) {
        if (record.state === "consumed" || now >= record.expiresAtMs) {
          wipe(record.secretBuffer);
          record.secretBuffer = null;
          sessions.delete(sessionId);
          purged += 1;
        }
      }
      return purged;
    },
  });
}
