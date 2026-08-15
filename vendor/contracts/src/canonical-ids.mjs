const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^v([1-9][0-9]*)$/;

const DEFINITIONS = {
  capability: { min: 1 },
  component: { min: 2 },
  contract: { min: 1, versioned: true },
  policy: { min: 2 },
  decision: { min: 1 },
  planning: { min: 1 },
  plan: { min: 1 },
  approval: { min: 1 },
  audit: { min: 1 },
  reflection: { min: 1 },
  evolution: { min: 1 },
  governance: { min: 1 },
  proposal: { min: 1 },
  evidence: { min: 1 },
  runtime: { min: 1 },
  event: { min: 1 },
  trace: { min: 1 },
};

export const canonicalIdContractVersion = "1.0.0";
export const canonicalIdFamilies = Object.freeze(Object.fromEntries(
  Object.entries(DEFINITIONS).map(([name, value]) => [name, Object.freeze({ ...value, minSegments: value.min })]),
));

function fail(code, message, details = {}) {
  return Object.freeze({ valid: false, code, message, ...details });
}

export function validateCanonicalId(value, { expectedFamily } = {}) {
  if (typeof value !== "string" || value.length === 0) {
    return fail("ID_REQUIRED", "id must be a non-empty string");
  }
  if (value !== value.trim()) return fail("ID_WHITESPACE", "id must not contain surrounding whitespace");
  if (value !== value.toLowerCase()) return fail("ID_CASE", "id must use lowercase characters only");

  const parts = value.split(".");
  if (parts.some((part) => part.length === 0)) return fail("ID_EMPTY_SEGMENT", "id must not contain empty segments");

  const [family, ...segments] = parts;
  const definition = DEFINITIONS[family];
  if (!definition) return fail("ID_UNKNOWN_FAMILY", `unknown canonical id family: ${family}`, { family });
  if (expectedFamily != null && family !== expectedFamily) {
    return fail("ID_FAMILY_MISMATCH", `expected canonical id family ${expectedFamily}, received ${family}`, {
      family,
      expectedFamily,
    });
  }

  let versionMajor = null;
  let semanticSegments = segments;
  if (definition.versioned) {
    const match = VERSION.exec(segments.at(-1) ?? "");
    if (!match) {
      return fail("ID_INVALID_VERSION", "contract ids must end with a positive major version such as v1", {
        family,
        versionSegment: segments.at(-1) ?? null,
      });
    }
    versionMajor = Number(match[1]);
    semanticSegments = segments.slice(0, -1);
  }

  if (semanticSegments.length < definition.min) {
    return fail("ID_SEGMENT_COUNT", `${family} ids require at least ${definition.min} semantic segment(s)`, {
      family,
      segments: Object.freeze([...segments]),
    });
  }

  const invalidSegment = semanticSegments.find((segment) => !SEGMENT.test(segment));
  if (invalidSegment) {
    return fail("ID_INVALID_SEGMENT", `invalid canonical id segment: ${invalidSegment}`, {
      family,
      segment: invalidSegment,
    });
  }

  return Object.freeze({
    valid: true,
    code: "ID_VALID",
    id: value,
    family,
    segments: Object.freeze([...segments]),
    semanticSegments: Object.freeze([...semanticSegments]),
    versionMajor,
    contractVersion: canonicalIdContractVersion,
  });
}

export function isCanonicalId(value, options = {}) {
  return validateCanonicalId(value, options).valid;
}

export function assertCanonicalId(value, options = {}) {
  const result = validateCanonicalId(value, options);
  if (!result.valid) {
    const error = new TypeError(result.message);
    error.code = result.code;
    error.details = result;
    throw error;
  }
  return result;
}

export function parseCanonicalId(value, options = {}) {
  return assertCanonicalId(value, options);
}

export function createCanonicalId({ family, segments, versionMajor } = {}) {
  if (typeof family !== "string" || family.length === 0) throw new TypeError("family must be a non-empty string");
  const definition = DEFINITIONS[family];
  if (!definition) throw new TypeError(`unknown canonical id family: ${family}`);
  if (!Array.isArray(segments) || segments.length === 0) throw new TypeError("segments must be a non-empty array");

  for (const [index, segment] of segments.entries()) {
    if (typeof segment !== "string" || segment.length === 0) {
      throw new TypeError(`segments[${index}] must be a non-empty string`);
    }
    if (!SEGMENT.test(segment)) throw new TypeError(`invalid canonical id segment: ${segment}`);
  }

  const output = [family, ...segments];
  if (definition.versioned) {
    if (!Number.isSafeInteger(versionMajor) || versionMajor < 1) {
      throw new TypeError("versionMajor must be a positive safe integer for contract ids");
    }
    output.push(`v${versionMajor}`);
  } else if (versionMajor != null) {
    throw new TypeError("versionMajor is only valid for contract ids");
  }

  const id = output.join(".");
  assertCanonicalId(id, { expectedFamily: family });
  return id;
}
