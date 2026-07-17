const SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTRACT_VERSION_PATTERN = /^v([1-9][0-9]*)$/;

const FAMILY_DEFINITIONS = {
  capability: { minSegments: 1 },
  component: { minSegments: 2 },
  contract: { minSegments: 1, versioned: true },
  policy: { minSegments: 2 },
  decision: { minSegments: 1 },
  planning: { minSegments: 1 },
  plan: { minSegments: 1 },
  approval: { minSegments: 1 },
  audit: { minSegments: 1 },
  reflection: { minSegments: 1 },
  evolution: { minSegments: 1 },
  governance: { minSegments: 1 },
  proposal: { minSegments: 1 },
  evidence: { minSegments: 1 },
  runtime: { minSegments: 1 },
  event: { minSegments: 1 },
  trace: { minSegments: 1 },
};

export const canonicalIdContractVersion = "1.0.0";

export const canonicalIdFamilies = Object.freeze(
  Object.fromEntries(
    Object.entries(FAMILY_DEFINITIONS).map(([family, definition]) => [
      family,
      Object.freeze({ ...definition }),
    ]),
  ),
);

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function validationError(code, message, details = {}) {
  return Object.freeze({
    valid: false,
    code,
    message,
    ...details,
  });
}

export function validateCanonicalId(value, { expectedFamily } = {}) {
  if (typeof value !== "string" || value.length === 0) {
    return validationError("ID_REQUIRED", "id must be a non-empty string");
  }

  if (value !== value.trim()) {
    return validationError("ID_WHITESPACE", "id must not contain surrounding whitespace");
  }

  if (value.toLowerCase() !== value) {
    return validationError("ID_CASE", "id must use lowercase characters only");
  }

  const parts = value.split(".");
  if (parts.some((part) => part.length === 0)) {
    return validationError("ID_EMPTY_SEGMENT", "id must not contain empty segments");
  }

  const [family, ...segments] = parts;
  const definition = FAMILY_DEFINITIONS[family];

  if (!definition) {
    return validationError("ID_UNKNOWN_FAMILY", `unknown canonical id family: ${family}`, {
      family,
    });
  }

  if (expectedFamily != null && family !== expectedFamily) {
    return validationError(
      "ID_FAMILY_MISMATCH",
      `expected canonical id family ${expectedFamily}, received ${family}`,
      { family, expectedFamily },
    );
  }

  let versionMajor = null;
  if (definition.versioned) {
    const versionSegment = segments.at(-1);
    const match = CONTRACT_VERSION_PATTERN.exec(versionSegment ?? "");
    if (!match) {
      return validationError(
        "ID_INVALID_VERSION",
        "contract ids must end with a positive major version such as v1",
        { family, versionSegment: versionSegment ?? null },
      );
    }
    versionMajor = Number(match[1]);
  }

  const semanticSegments = definition.versioned ? segments.slice(0, -1) : segments;
  if (semanticSegments.length < definition.minSegments) {
    return validationError(
      "ID_SEGMENT_COUNT",
      `${family} ids require at least ${definition.minSegments} semantic segment(s)`,
      { family, segments: Object.freeze([...segments]) },
    );
  }

  const invalidSegment = semanticSegments.find((segment) => !SEGMENT_PATTERN.test(segment));
  if (invalidSegment) {
    return validationError(
      "ID_INVALID_SEGMENT",
      `invalid canonical id segment: ${invalidSegment}`,
      { family, segment: invalidSegment },
    );
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
  assertNonEmptyString(family, "family");
  const definition = FAMILY_DEFINITIONS[family];
  if (!definition) {
    throw new TypeError(`unknown canonical id family: ${family}`);
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new TypeError("segments must be a non-empty array");
  }

  const normalizedSegments = segments.map((segment, index) => {
    assertNonEmptyString(segment, `segments[${index}]`);
    if (!SEGMENT_PATTERN.test(segment)) {
      throw new TypeError(`invalid canonical id segment: ${segment}`);
    }
    return segment;
  });

  let idSegments = [...normalizedSegments];
  if (definition.versioned) {
    if (!Number.isSafeInteger(versionMajor) || versionMajor < 1) {
      throw new TypeError("versionMajor must be a positive safe integer for contract ids");
    }
    idSegments.push(`v${versionMajor}`);
  } else if (versionMajor) != null) {
    throw new TypeError("versionMajor is only valid for contract ids");
  }

  const id = [family, ...idSegments].join(".");
  assertCanonicalId(id, { expectedFamily: family });
  return id;
}
