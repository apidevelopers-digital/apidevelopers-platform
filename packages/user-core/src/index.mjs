
export const USER_STATUSES = Object.freeze([
  "pending_verification",
  "active",
  "restricted",
  "suspended",
  "deleted",
]);

export class UserDomainError extends Error {
  constructor(code, message, { details = {}, cause } = {}) {
    super(message, { cause });
    this.name = "UserDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

const transitions = Object.freeze({
  pending_verification: ["active", "deleted"],
  active: ["restricted", "suspended", "deleted"],
  restricted: ["active", "suspended", "deleted"],
  suspended: ["active", "deleted"],
  deleted: [],
});

const transitionEvents = Object.freeze({
  "pending_verification:active": "user.email_verified",
  "pending_verification:deleted": "user.deleted",
  "active:restricted": "user.restricted",
  "active:suspended": "user.suspended",
  "active:deleted": "user.deleted",
  "restricted:active": "user.reactivated",
  "restricted:suspended": "user.suspended",
  "restricted:deleted": "user.deleted",
  "suspended:active": "user.reactivated",
  "suspended:deleted": "user.deleted",
});

function required(value, name) {
  const result = String(value ?? "").trim();
  if (!result) throw new UserDomainError("invalid_argument", `${name} is required`);
  return result;
}

function immutable(value) {
  const copy = structuredClone(value);
  for (const nested of Object.values(copy)) {
    if (nested && typeof nested === "object") Object.freeze(nested);
  }
  return Object.freeze(copy);
}

function iso(value, name) {
  const result = required(value, name);
  if (Number.isNaN(Date.parse(result))) {
    throw new UserDomainError("invalid_argument", `${name} must be an ISO date`);
  }
  return result;
}

export function normalizeUserEmail(value) {
  const email = required(value, "email").toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new UserDomainError("invalid_user_email", "user email is invalid", {
      details: { email },
    });
  }
  return email;
}

export function createUserRecord({
  id,
  email,
  displayName,
  status = "pending_verification",
  emailVerifiedAt = null,
  metadata = {},
  createdAt,
  updatedAt = createdAt,
}) {
  if (!USER_STATUSES.includes(status)) {
    throw new UserDomainError("invalid_user_status", "user status is not supported", {
      details: { status },
    });
  }
  const verifiedAt = emailVerifiedAt === null ? null : iso(emailVerifiedAt, "emailVerifiedAt");
  if (status === "active" && verifiedAt === null) {
    throw new UserDomainError(
      "email_not_verified",
      "active users must have a verified email",
    );
  }
  return immutable({
    id: required(id, "id"),
    email: normalizeUserEmail(email),
    displayName: required(displayName, "displayName"),
    status,
    emailVerifiedAt: verifiedAt,
    metadata: structuredClone(metadata),
    createdAt: iso(createdAt, "createdAt"),
    updatedAt: iso(updatedAt, "updatedAt"),
  });
}

export function createMemoryUserRepository({ initialUsers = [] } = {}) {
  const byId = new Map();
  const emailToId = new Map();

  function store(input, replace = false) {
    const user = createUserRecord(input);
    const existing = byId.get(user.id);
    const emailOwner = emailToId.get(user.email);

    if (!replace && existing) {
      throw new UserDomainError("user_id_conflict", "user id already exists");
    }
    if (emailOwner && emailOwner !== user.id) {
      throw new UserDomainError("user_email_conflict", "user email already exists");
    }
    if (replace && !existing) {
      throw new UserDomainError("user_not_found", "user not found");
    }
    if (existing && existing.email !== user.email) emailToId.delete(existing.email);

    byId.set(user.id, user);
    emailToId.set(user.email, user.id);
    return immutable(user);
  }

  initialUsers.forEach((user) => store(user));

  return Object.freeze({
    kind: "memory",
    create: (user) => store(user),
    replace: (user) => store(user, true),
    getById(id) {
      const user = byId.get(required(id, "userId"));
      return user ? immutable(user) : null;
    },
    getByEmail(email) {
      const id = emailToId.get(normalizeUserEmail(email));
      return id ? immutable(byId.get(id)) : null;
    },
    list({ status } = {}) {
      return [...byId.values()]
        .filter((user) => status === undefined || user.status === status)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map(immutable);
    },
  });
}

function assertRepository(repository) {
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

export function assertUserActive(user) {
  if (user?.status !== "active") {
    throw new UserDomainError("user_not_active", "user is not active", {
      details: { userId: user?.id, status: user?.status },
    });
  }
  return true;
}

export function assertUserEmailVerified(user) {
  if (!user?.emailVerifiedAt) {
    throw new UserDomainError("email_not_verified", "user email is not verified", {
      details: { userId: user?.id },
    });
  }
  return true;
}

export function createUserService({
  repository = createMemoryUserRepository(),
  idFactory,
  clock = () => new Date().toISOString(),
} = {}) {
  const users = assertRepository(repository);
  if (typeof idFactory !== "function") {
    throw new UserDomainError("invalid_argument", "idFactory must be a function");
  }

  const now = () => iso(clock(), "clock result");
  const getRequired = (userId) => {
    const user = users.getById(userId);
    if (!user) {
      throw new UserDomainError("user_not_found", "user not found", {
        details: { userId },
      });
    }
    return user;
  };

  function transition(userId, nextStatus) {
    const current = getRequired(userId);
    if (!(transitions[current.status] ?? []).includes(nextStatus)) {
      throw new UserDomainError(
        "invalid_user_transition",
        `user cannot transition from ${current.status} to ${nextStatus}`,
        { details: { userId: current.id, from: current.status, to: nextStatus } },
      );
    }
    const updatedAt = now();
    const emailVerifiedAt =
      current.status === "pending_verification" && nextStatus === "active"
        ? updatedAt
        : current.emailVerifiedAt;
    const user = users.replace(
      createUserRecord({
        ...current,
        status: nextStatus,
        emailVerifiedAt,
        updatedAt,
      }),
    );
    return immutable({
      user,
      events: [{
        type: transitionEvents[`${current.status}:${nextStatus}`],
        userId: user.id,
        occurredAt: updatedAt,
        data: { previousStatus: current.status, status: user.status },
      }],
    });
  }

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",
    registerUser({ email, displayName, metadata = {} }) {
      const createdAt = now();
      const user = users.create(
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
          data: { email: user.email, status: user.status },
        }],
      });
    },
    verifyEmail: (id) => transition(id, "active"),
    restrictUser: (id) => transition(id, "restricted"),
    suspendUser: (id) => transition(id, "suspended"),
    reactivateUser: (id) => transition(id, "active"),
    deleteUser: (id) => transition(id, "deleted"),
    updateProfile(userId, { displayName, metadata }) {
      const current = getRequired(userId);
      if (current.status === "deleted") {
        throw new UserDomainError("user_deleted", "deleted user cannot be updated");
      }
      const updatedAt = now();
      const user = users.replace(
        createUserRecord({
          ...current,
          displayName: displayName ?? current.displayName,
          metadata: metadata ?? current.metadata,
          updatedAt,
        }),
      );
      return immutable({
        user,
        events: [{
          type: "user.profile_updated",
          userId: user.id,
          occurredAt: updatedAt,
          data: {},
        }],
      });
    },
    getUser: getRequired,
    getUserByEmail: (email) => users.getByEmail(email),
    listUsers: (filters) => users.list(filters),
  });
}
