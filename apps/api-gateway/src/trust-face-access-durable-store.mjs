import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_DATA = Object.freeze({
  version: 1,
  credentials: [],
  challenges: [],
});

export class TrustFaceAccessDurableStoreError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "TrustFaceAccessDurableStoreError";
    this.code = code;
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TrustFaceAccessDurableStoreError(`${field}_required`);
  }
  return value.trim();
}

function normalizeData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return clone(DEFAULT_DATA);

  return {
    version: 1,
    credentials: Array.isArray(data.credentials) ? data.credentials.filter(Boolean) : [],
    challenges: Array.isArray(data.challenges) ? data.challenges.filter(Boolean) : [],
  };
}

export function createInMemoryTrustFaceAccessDurableStore({
  initialData = DEFAULT_DATA,
  now = () => new Date().toISOString(),
} = {}) {
  let data = normalizeData(initialData);

  async function readData() {
    return clone(data);
  }

  async function writeData(nextData) {
    data = normalizeData(nextData);
    return clone(data);
  }

  return createTrustFaceAccessDurableStoreAdapter({ readData, writeData, now });
}

export function createFileTrustFaceAccessDurableStore({
  path,
  now = () => new Date().toISOString(),
} = {}) {
  const filePath = assertNonEmptyString(path, "path");

  async function readData() {
    try {
      const raw = await readFile(filePath, "utf8");
      return normalizeData(JSON.parse(raw));
    } catch (error) {
      if (error?.code === "ENOENT") return clone(DEFAULT_DATA);
      if (error instanceof SyntaxError) {
        throw new TrustFaceAccessDurableStoreError("invalid_store_json");
      }
      throw error;
    }
  }

  async function writeData(nextData) {
    const normalized = normalizeData(nextData);
    await mkdir(dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(tmpPath, filePath);
    return clone(normalized);
  }

  return createTrustFaceAccessDurableStoreAdapter({ readData, writeData, now });
}

export function createTrustFaceAccessDurableStoreAdapter({
  readData,
  writeData,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof readData !== "function") throw new TypeError("readData must be a function");
  if (typeof writeData !== "function") throw new TypeError("writeData must be a function");

  async function pruneExpiredChallenges(data) {
    const current = now();
    const nextData = {
      ...data,
      challenges: data.challenges.filter((challenge) => !challenge.expiresAt || challenge.expiresAt > current),
    };

    if (nextData.challenges.length !== data.challenges.length) await writeData(nextData);
    return nextData;
  }

  return Object.freeze({
    async saveChallenge(record) {
      const challenge = assertNonEmptyString(record?.challenge, "challenge");
      const type = assertNonEmptyString(record?.type, "type");
      const userId = assertNonEmptyString(record?.userId, "user_id");
      const expiresAt = assertNonEmptyString(record?.expiresAt, "expires_at");

      const data = await pruneExpiredChallenges(await readData());
      const withoutDuplicate = data.challenges.filter((stored) => stored.challenge !== challenge);

      await writeData({
        ...data,
        challenges: [
          ...withoutDuplicate,
          {
            challenge,
            type,
            userId,
            expiresAt,
            createdAt: record.createdAt ?? now(),
          },
        ],
      });

      return challenge;
    },

    async consumeChallenge({ challenge, type, userId }) {
      const normalizedChallenge = assertNonEmptyString(challenge, "challenge");
      const normalizedType = assertNonEmptyString(type, "type");
      const normalizedUserId = assertNonEmptyString(userId, "user_id");

      const data = await pruneExpiredChallenges(await readData());
      const stored = data.challenges.find((item) => item.challenge === normalizedChallenge);

      if (!stored) throw new TrustFaceAccessDurableStoreError("challenge_not_found");
      if (stored.type !== normalizedType) throw new TrustFaceAccessDurableStoreError("challenge_type_mismatch");
      if (stored.userId !== normalizedUserId) throw new TrustFaceAccessDurableStoreError("challenge_user_mismatch");

      await writeData({
        ...data,
        challenges: data.challenges.filter((item) => item.challenge !== normalizedChallenge),
      });

      return clone(stored);
    },

    async saveCredential(record) {
      const userId = assertNonEmptyString(record?.userId, "user_id");
      const credentialId = assertNonEmptyString(record?.credentialId, "credential_id");

      const data = await pruneExpiredChallenges(await readData());
      const withoutDuplicate = data.credentials.filter(
        (credential) => !(credential.userId === userId && credential.credentialId === credentialId),
      );

      await writeData({
        ...data,
        credentials: [
          ...withoutDuplicate,
          {
            userId,
            credentialId,
            userName: record.userName ?? null,
            displayName: record.displayName ?? record.userName ?? null,
            publicKey: record.publicKey ?? null,
            signCount: Number.isInteger(record.signCount) ? record.signCount : 0,
            transports: Array.isArray(record.transports) ? [...record.transports] : [],
            rpId: record.rpId ?? null,
            origin: record.origin ?? null,
            createdAt: record.createdAt ?? now(),
            lastUsedAt: record.lastUsedAt ?? null,
            status: record.status ?? "active",
          },
        ],
      });

      return credentialId;
    },

    async listCredentialDescriptors(userId) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const data = await pruneExpiredChallenges(await readData());

      return data.credentials
        .filter((credential) => credential.userId === normalizedUserId && credential.status !== "revoked")
        .map((credential) => Object.freeze({
          type: "public-key",
          id: credential.credentialId,
          transports: Array.isArray(credential.transports) ? [...credential.transports] : [],
        }));
    },

    async getCredential({ userId, credentialId }) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const normalizedCredentialId = assertNonEmptyString(credentialId, "credential_id");
      const data = await pruneExpiredChallenges(await readData());

      return clone(data.credentials.find(
        (credential) =>
          credential.userId === normalizedUserId &&
          credential.credentialId === normalizedCredentialId &&
          credential.status !== "revoked",
      ) ?? null);
    },

    async revokeCredential({ userId, credentialId, revokedAt = now() }) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const normalizedCredentialId = assertNonEmptyString(credentialId, "credential_id");
      const data = await pruneExpiredChallenges(await readData());
      let revoked = false;

      const credentials = data.credentials.map((credential) => {
        if (credential.userId !== normalizedUserId || credential.credentialId !== normalizedCredentialId) return credential;
        revoked = true;
        return {
          ...credential,
          status: "revoked",
          revokedAt,
        };
      });

      await writeData({ ...data, credentials });
      return revoked;
    },
  });
}
