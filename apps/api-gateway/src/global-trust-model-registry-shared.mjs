import {
  assertModelDescriptorContract,
  createModelDescriptor,
} from "@apidevelopers/contracts";

import { MODEL_REGISTRY_EVENT_COLLECTION } from "./global-trust-model-registry-integrity.mjs";

export const MODEL_STATUSES = new Set(["candidate", "approved", "suspended", "retired"]);
export const TRANSITIONS = Object.freeze({
  candidate: new Set(["approved", "suspended", "retired"]),
  approved: new Set(["suspended", "retired"]),
  suspended: new Set(["approved", "retired"]),
  retired: new Set(),
});

export function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

export function normalizeLocales(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("allowedLocales must be a non-empty array");
  }
  return [...new Set(values.map((value, index) =>
    required(value, `allowedLocales[${index}]`)
  ))].sort();
}

export function tenantModelEvents(tx, tenantId, modelId) {
  return tx.list(MODEL_REGISTRY_EVENT_COLLECTION)
    .map(({ value }) => value)
    .filter((event) =>
      event?.tenantId === tenantId
      && (modelId === undefined || event.modelId === modelId)
    )
    .sort((left, right) =>
      left.revision - right.revision
      || left.eventId.localeCompare(right.eventId)
    );
}

export function currentDescriptor(events) {
  return events.at(-1)?.descriptor ?? null;
}

export class ModelRegistryError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "ModelRegistryError";
    this.code = code;
    this.status = status;
  }
}

export function assertHumanOperator(identity, tenantId) {
  const principal = identity?.principal ?? {};
  const actorId = required(principal.id, "identity.principal.id");
  if (principal.kind !== "human") {
    throw new ModelRegistryError(
      "human_operator_required",
      "only a human principal may change the model registry",
      403,
    );
  }
  if (required(principal.tenantId, "identity.principal.tenantId") !== tenantId) {
    throw new ModelRegistryError(
      "tenant_mismatch",
      "operator tenant must match the model registry tenant",
      403,
    );
  }
  return actorId;
}

export function createDescriptor(input) {
  const descriptor = createModelDescriptor(input);
  assertModelDescriptorContract(descriptor);
  return descriptor;
}

export function publicEvent(event) {
  return Object.freeze({
    contractType: event.contractType,
    contractVersion: event.contractVersion,
    eventId: event.eventId,
    tenantId: event.tenantId,
    modelId: event.modelId,
    revision: event.revision,
    eventType: event.eventType,
    previousEventId: event.previousEventId,
    reasonCode: event.reasonCode,
    changedBy: event.changedBy,
    changedAt: event.changedAt,
    correlationId: event.correlationId,
    descriptor: event.descriptor,
    sensitiveContentIncluded: false,
  });
}
