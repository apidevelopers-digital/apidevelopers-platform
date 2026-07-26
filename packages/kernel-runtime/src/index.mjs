const SECRET_PATTERN = /(token|secret|password|api[-_]?key|authorization|private[-_]?key)/i;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function assertString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SECRET_PATTERN.test(key) ? "[REDACTED]" : redact(child),
    ]),
  );
}

export const runtimeModes = Object.freeze(["preview", "execute"]);
export const runtimeStatuses = Object.freeze(["previewed", "executed", "blocked", "failed"]);

export class RuntimeEngine {
  constructor({ clock = () => new Date().toISOString(), actions = {} } = {}) {
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
      throw new TypeError("actions must be an object");
    }
    this.clock = clock;
    this.actions = new Map(Object.entries(actions));
  }

  register(action, adapter) {
    assertString(action, "action");
    if (typeof adapter !== "function") throw new TypeError("adapter must be a function");
    this.actions.set(action, adapter);
    return this;
  }

  async run(request, { mode = "preview", approval = null, confirmation = null } = {}) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new TypeError("request must be an object");
    }
    assertString(request.action, "request.action");
    assertString(request.tenantId, "request.tenantId");
    assertString(request.cycleId, "request.cycleId");
    if (!runtimeModes.includes(mode)) throw new TypeError(`unsupported runtime mode: ${mode}`);
    if (!this.actions.has(request.action)) throw new Error(`unregistered runtime action: ${request.action}`);

    const before = clone(request);
    const generatedAt = this.clock();
    const base = {
      runtimeId: `runtime.${generatedAt.replace(/[-:.TZ]/g, "").toLowerCase()}`,
      generatedAt,
      tenantId: request.tenantId,
      cycleId: request.cycleId,
      action: request.action,
      mode,
      request: redact(clone(request)),
      mutationAllowed: false,
      automaticApprovalAllowed: false,
      evidenceRequired: true,
    };

    if (mode === "preview") {
      return freeze({
        ...base,
        status: "previewed",
        executed: false,
        confirmationRequired: true,
        approvalRequired: true,
      });
    }

    if (!approval || approval.status !== "approved" || !approval.approvalId || !approval.approvedBy) {
      return freeze({ ...base, status: "blocked", executed: false, reason: "fresh-human-approval-required" });
    }
    if (approval.consumedAt || approval.replayed === true || approval.used === true) {
      return freeze({ ...base, status: "blocked", executed: false, reason: "approval-replay-blocked" });
    }
    for (const [field, expected] of [
      ["tenantId", request.tenantId],
      ["cycleId", request.cycleId],
      ["decisionId", request.decisionId],
      ["proposalId", request.proposalId],
      ["action", request.action],
    ]) {
      if (approval[field] != null && expected != null && approval[field] !== expected) {
        return freeze({ ...base, status: "blocked", executed: false, reason: `approval-${field}-mismatch` });
      }
    }
    if (confirmation !== "EXECUTE_APPROVED_ACTION") {
      return freeze({ ...base, status: "blocked", executed: false, reason: "explicit-confirmation-required" });
    }

    const result = await this.actions.get(request.action)(clone(request.payload ?? {}), {
      tenantId: request.tenantId,
      cycleId: request.cycleId,
      approval: clone(approval),
    });

    if (JSON.stringify(before) !== JSON.stringify(request)) {
      throw new Error("runtime request was mutated");
    }

    return freeze({
      ...base,
      status: "executed",
      executed: true,
      approvalId: approval.approvalId,
      approvedBy: approval.approvedBy,
      result: redact(clone(result)),
    });
  }
}

export function createRuntimeEngine(options = {}) {
  return new RuntimeEngine(options);
}
