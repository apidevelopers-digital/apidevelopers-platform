import { readFile } from "node:fs/promises";
import path from "node:path";

function typeMatches(value, expected) {
  if (Array.isArray(expected)) {
    return expected.some((item) => typeMatches(value, item));
  }
  if (expected === "null") return value === null;
  if (expected === "array") return Array.isArray(value);
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === expected;
}

function pushDiagnostic(diagnostics, options) {
  diagnostics.push({
    schemaVersion: 1,
    capability: options.capability ?? null,
    validator: "ContractValidator",
    severity: "error",
    code: options.code,
    message: options.message,
    recommendation: options.recommendation ?? null,
    evidence: options.evidence ?? null,
    documentation: options.documentation ?? null,
  });
}

function validateNode(value, schema, pointer, diagnostics, capability) {
  if (!schema || typeof schema !== "object") return;

  if ("const" in schema && value !== schema.const) {
    pushDiagnostic(diagnostics, {
      capability,
      code: "CONTRACT_CONST_MISMATCH",
      message: `${pointer} must equal ${JSON.stringify(schema.const)}`,
      evidence: { pointer, actual: value },
    });
  }

  if (schema.type && !typeMatches(value, schema.type)) {
    pushDiagnostic(diagnostics, {
      capability,
      code: "CONTRACT_TYPE_MISMATCH",
      message: `${pointer} has an invalid type`,
      evidence: {
        pointer,
        expected: schema.type,
        actual: value === null ? "null" : typeof value,
      },
    });
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    pushDiagnostic(diagnostics, {
      capability,
      code: "CONTRACT_ENUM_MISMATCH",
      message: `${pointer} must match an allowed value`,
      evidence: { pointer, allowed: schema.enum, actual: value },
    });
  }

  if (
    schema.pattern &&
    typeof value === "string" &&
    !new RegExp(schema.pattern).test(value)
  ) {
    pushDiagnostic(diagnostics, {
      capability,
      code: "CONTRACT_PATTERN_MISMATCH",
      message: `${pointer} does not match the required pattern`,
      evidence: { pointer, pattern: schema.pattern, actual: value },
    });
  }

  if (
    schema.minLength &&
    typeof value === "string" &&
    value.length < schema.minLength
  ) {
    pushDiagnostic(diagnostics, {
      capability,
      code: "CONTRACT_MIN_LENGTH",
      message: `${pointer} is shorter than the required minimum`,
      evidence: {
        pointer,
        minLength: schema.minLength,
        actualLength: value.length,
      },
    });
  }

  if (
    schema.minimum !== undefined &&
    typeof value === "number" &&
    value < schema.minimum
  ) {
    pushDiagnostic(diagnostics, {
      capability,
      code: "CONTRACT_MINIMUM",
      message: `${pointer} is below the required minimum`,
      evidence: { pointer, minimum: schema.minimum, actual: value },
    });
  }

  if (Array.isArray(value)) {
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        pushDiagnostic(diagnostics, {
          capability,
          code: "CONTRACT_DUPLICATE_ARRAY_ITEM",
          message: `${pointer} must contain unique items`,
          evidence: { pointer },
        });
      }
    }

    if (schema.items) {
      value.forEach((item, index) => {
        validateNode(
          item,
          schema.items,
          `${pointer}/${index}`,
          diagnostics,
          capability,
        );
      });
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const required of schema.required ?? []) {
      if (!(required in value)) {
        pushDiagnostic(diagnostics, {
          capability,
          code: "CONTRACT_REQUIRED_MISSING",
          message: `${pointer}/${required} is required`,
          evidence: { pointer, required },
        });
      }
    }

    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) {
          pushDiagnostic(diagnostics, {
            capability,
            code: "CONTRACT_ADDITIONAL_PROPERTY",
            message: `${pointer}/${key} is not allowed`,
            evidence: { pointer, property: key },
          });
        }
      }
    }

    for (const [key, childSchema] of Object.entries(
      schema.properties ?? {},
    )) {
      if (key in value) {
        validateNode(
          value[key],
          childSchema,
          `${pointer}/${key}`,
          diagnostics,
          capability,
        );
      }
    }
  }
}

export async function loadContract(
  contractPath,
  rootDir = process.cwd(),
) {
  const absolutePath = path.resolve(rootDir, contractPath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

export function validateAgainstContract(value, schema, options = {}) {
  const diagnostics = [];
  validateNode(
    value,
    schema,
    "#",
    diagnostics,
    options.capability ?? value?.id ?? null,
  );
  return diagnostics;
}
