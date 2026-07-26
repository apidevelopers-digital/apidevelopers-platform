export const orchestrationContractVersion = 1;

export function orchestrationClone(value) {
  return value == null ? value : structuredClone(value);
}

export function orchestrationDeepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) orchestrationDeepFreeze(child);
  return value;
}

export function orchestrationAssertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

export function orchestrationAssertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

export function orchestrationAssertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

export function orchestrationNormalizeStrings(
  value,
  name,
  { required = false } = {},
) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  const normalized = value.map((item, index) => {
    orchestrationAssertString(item, `${name}[${index}]`);
    return item.trim();
  });
  const unique = [...new Set(normalized)].sort();
  if (required && unique.length === 0) {
    throw new TypeError(`${name} must be a non-empty array`);
  }
  return unique;
}

export function orchestrationAssertVersion(value, name) {
  if (value !== orchestrationContractVersion) {
    throw new Error(
      `${name}.schemaVersion must be ${orchestrationContractVersion}`,
    );
  }
}

export function orchestrationAssertFalse(value, name) {
  if (value !== false) throw new Error(`${name} must be false`);
}

export function orchestrationAssertTrue(value, name) {
  if (value !== true) throw new Error(`${name} must be true`);
}

export function orchestrationAssertIsoDate(value, name) {
  orchestrationAssertString(value, name);
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO date`);
  }
}
