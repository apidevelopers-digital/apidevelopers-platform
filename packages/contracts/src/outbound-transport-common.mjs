export const outboundTransportContractVersion = 1;
export const outboundTransportExecutionConfirmation =
  "EXECUTE_APPROVED_OUTBOUND_TRANSPORT";

export const outboundTransportOpaqueRefPattern =
  /^[a-z0-9][a-z0-9._:-]{2,191}$/i;
export const outboundTransportSha256Pattern = /^[a-f0-9]{64}$/;

export function outboundTransportClone(value) {
  return value == null ? value : structuredClone(value);
}

export function outboundTransportDeepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) {
      outboundTransportDeepFreeze(entry);
    }
    Object.freeze(value);
  }
  return value;
}

export function outboundTransportAssertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

export function outboundTransportAssertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
}

export function outboundTransportAssertBoolean(value, expected, name) {
  if (value !== expected) {
    throw new Error(`${name} must be ${expected}`);
  }
}

export function outboundTransportAssertIsoDate(value, name) {
  outboundTransportAssertString(value, name);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be an ISO date`);
  }
  return parsed;
}

export function outboundTransportAssertOpaqueReference(
  value,
  name,
  prefix,
) {
  outboundTransportAssertString(value, name);
  if (
    !value.startsWith(`${prefix}.`) ||
    !outboundTransportOpaqueRefPattern.test(value)
  ) {
    throw new Error(`${name} must be an opaque ${prefix} reference`);
  }
  if (value.includes("@") || value.includes("+") || /\s/.test(value)) {
    throw new Error(`${name} must not contain a raw destination or identity`);
  }
}

export function outboundTransportNormalizeReferences(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  const normalized = value.map((entry, index) => {
    outboundTransportAssertOpaqueReference(
      entry,
      `${name}[${index}]`,
      "evidence",
    );
    return entry.trim();
  });
  return [...new Set(normalized)].sort();
}

export function outboundTransportAssertHash(value, name) {
  outboundTransportAssertString(value, name);
  if (!outboundTransportSha256Pattern.test(value)) {
    throw new Error(`${name} must be a lowercase SHA-256 hex digest`);
  }
}

export function outboundTransportAssertContractVersion(value, name) {
  if (value !== outboundTransportContractVersion) {
    throw new Error(
      `${name}.schemaVersion must be ${outboundTransportContractVersion}`,
    );
  }
}

export function outboundTransportAssertRequestBindings(
  subject,
  request,
  name,
) {
  for (const field of [
    "requestId",
    "tenantId",
    "destinationRef",
    "contentHash",
    "idempotencyKey",
  ]) {
    if (subject[field] !== request[field]) {
      throw new Error(`${name}.${field} mismatch`);
    }
  }
}
