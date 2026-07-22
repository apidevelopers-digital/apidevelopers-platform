import {
  UserDomainError,
  createUserRecord,
  normalizeUserEmail,
} from "./index.mjs";

function required(value, name) {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new UserDomainError("invalid_argument", `${name} is required`);
  }
  return result;
}

function assertAsyncRepository(repository) {
  for (const method of ["create", "replace", "getById", "getByEmail", "list"]) {
    if (typeof repository?.[method] !== "function") {
      throw new UserDomainError(
        "invalid_repository",
        `repository.${method} must be a function`,
      );
    }
  }
  return repository;
}

function immutable(value) {
  return Object.freeze(structuredClone(value));
}

export function createAsyncUserService({
  repository,
  idFactory,
  clock = () => new Date().toISOString(),
} = {}) {
  const users = assertAsyncRepository(repository);

  if (typeof idFactory !== "function") {
    throw new UserDomainError(
      "invalid_argument",
      "idFactory must be a function",
    );
  }

  const now = () => {
    const value = required(clock(), "clock result");
    if (Number.isNaN(Date.parse(value))) {
      throw new UserDomainError(
        "invalid_argument",
        "clock result must be an ISO date",
      );
    }
    return value;
  };

  const getRequired = async (userId) => {
    const normalizedUserId = required(userId, "userId");
    const user = await users.getById(normalizedUserId);
    if (!user) {
      throw new UserDomainError("user_not_found", "user not found", {
        details: { userId: normalizedUserId },
      });
    }
    return user;
  };

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",

    async registerUser({
      email,
      displayName,
      metadata = {},
    }) {
      const createdAt = now();
      const user = await users.create(
        createUserRecord({
          id: required(idFactory(), "idFactory result"),
          email,
          displayName,
          metadata,
          status: "pending_verification",
          createdAt,
        }),
      );

      return immutable({
        user,
        events: [{
          type: "user.registered",
          userId: user.id,
          occurredAt: createdAt,
          data: {
            email: user.email,
            status: user.status,
          },
        }],
      });
    },

    getUser: getRequired,

    async getUserByEmail(email) {
      return users.getByEmail(normalizeUserEmail(email));
    },

    async listUsers(filters) {
      return users.list(filters);
    },
  });
}
