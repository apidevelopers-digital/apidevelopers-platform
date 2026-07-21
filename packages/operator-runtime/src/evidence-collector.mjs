import { randomUUID } from "node:crypto";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("runtime evidence event must be an object");
  }
  if (typeof event.type !== "string" || event.type.trim() === "") {
    throw new TypeError("runtime evidence event.type must be a non-empty string");
  }
}

export function createEvidenceCollector({
  tenantId,
  source = "ap.operator-runtime",
  sink = async () => {},
  clock = () => new Date(),
  idFactory = randomUUID,
} = {}) {
  if (tenantId != null && (typeof tenantId !== "string" || tenantId.trim() === "")) {
    throw new TypeError("tenantId must be a non-empty string when provided");
  }
  if (typeof source !== "string" || source.trim() === "") {
    throw new TypeError("source must be a non-empty string");
  }
  if (typeof sink !== "function") throw new TypeError("sink must be a function");
  if (typeof clock !== "function") throw new TypeError("clock must be a function");
  if (typeof idFactory !== "function") throw new TypeError("idFactory must be a function");

  const evidence = [];

  async function emit(event) {
    assertEvent(event);

    const occurredAt = clock();
    if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
      throw new TypeError("clock must return a valid Date");
    }

    const record = deepFreeze({
      schemaVersion: 1,
      eventId: idFactory(),
      occurredAt: occurredAt.toISOString(),
      source,
      ...(tenantId ? { tenantId } : {}),
      ...event,
    });

    await sink(record);
    evidence.push(record);
    return record;
  }

  function list() {
    return Object.freeze([...evidence]);
  }

  function snapshot() {
    return deepFreeze({
      schemaVersion: 1,
      source,
      ...(tenantId ? { tenantId } : {}),
      count: evidence.length,
      events: [...evidence],
    });
  }

  return Object.freeze({ emit, list, snapshot });
}
