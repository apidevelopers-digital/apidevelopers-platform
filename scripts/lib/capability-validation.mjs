import { readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_STRING_FIELDS = [
  "id",
  "displayName",
  "category",
  "owner",
  "maturity",
  "status",
  "factoryTemplate",
];

export function diagnostic({
  capability = null,
  validator,
  severity,
  code,
  message,
  recommendation = null,
}) {
  return {
    capability,
    validator,
    severity,
    code,
    message,
    recommendation,
  };
}

export function validateManifestShape(manifest, source = "<memory>") {
  const diagnostics = [];

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = manifest?.[field];
    if (typeof value !== "string" || value.trim() === "") {
      diagnostics.push(
        diagnostic({
          capability: manifest?.id ?? null,
          validator: "SchemaValidator",
          severity: "error",
          code: "SCHEMA_REQUIRED_STRING",
          message: `${source}: ${field} must be a non-empty string`,
        }),
      );
    }
  }

  if (manifest?.schemaVersion !== 1) {
    diagnostics.push(
      diagnostic({
        capability: manifest?.id ?? null,
        validator: "SchemaValidator",
        severity: "error",
        code: "SCHEMA_VERSION_UNSUPPORTED",
        message: `${source}: schemaVersion must equal 1`,
      }),
    );
  }

  for (const field of ["dependsOn", "publishes", "consumes"]) {
    if (!Array.isArray(manifest?.[field])) {
      diagnostics.push(
        diagnostic({
          capability: manifest?.id ?? null,
          validator: "SchemaValidator",
          severity: "error",
          code: "SCHEMA_REQUIRED_ARRAY",
          message: `${source}: ${field} must be an array`,
        }),
      );
    }
  }

  return diagnostics;
}

export function validateRegistry(manifests) {
  const diagnostics = [];
  const byId = new Map();

  for (const manifest of manifests) {
    diagnostics.push(...validateManifestShape(manifest, manifest.source));

    if (typeof manifest.id !== "string" || manifest.id.trim() === "") {
      continue;
    }

    if (byId.has(manifest.id)) {
      diagnostics.push(
        diagnostic({
          capability: manifest.id,
          validator: "DependencyValidator",
          severity: "error",
          code: "REGISTRY_DUPLICATE_ID",
          message: `duplicate capability id: ${manifest.id}`,
        }),
      );
      continue;
    }

    byId.set(manifest.id, manifest);
  }

  for (const manifest of manifests) {
    if (!Array.isArray(manifest.dependsOn)) continue;

    for (const dependency of manifest.dependsOn) {
      if (dependency === manifest.id) {
        diagnostics.push(
          diagnostic({
            capability: manifest.id,
            validator: "DependencyValidator",
            severity: "error",
            code: "DEPENDENCY_SELF_REFERENCE",
            message: `${manifest.id}: self dependency is not allowed`,
          }),
        );
      } else if (!byId.has(dependency)) {
        diagnostics.push(
          diagnostic({
            capability: manifest.id,
            validator: "DependencyValidator",
            severity: "error",
            code: "DEPENDENCY_MISSING",
            message: `${manifest.id}: missing dependency ${dependency}`,
          }),
        );
      }
    }
  }

  return { byId, diagnostics };
}

export async function validateDocumentation(manifests, rootDir = process.cwd()) {
  const diagnostics = [];

  for (const manifest of manifests) {
    const readme = manifest?.paths?.readme;
    if (typeof readme !== "string" || readme.trim() === "") {
      diagnostics.push(
        diagnostic({
          capability: manifest.id,
          validator: "DocumentationValidator",
          severity: "warning",
          code: "DOC_README_UNDECLARED",
          message: `${manifest.id}: README path is not declared`,
          recommendation: "Declare paths.readme in the capability manifest.",
        }),
      );
      continue;
    }

    try {
      await readFile(path.resolve(rootDir, readme), "utf8");
    } catch {
      diagnostics.push(
        diagnostic({
          capability: manifest.id,
          validator: "DocumentationValidator",
          severity: "warning",
          code: "DOC_README_MISSING",
          message: `${manifest.id}: README not found at ${readme}`,
          recommendation: "Generate or restore the README through the Platform Factory.",
        }),
      );
    }
  }

  return diagnostics;
}

export function summarizeDiagnostics(diagnostics) {
  return diagnostics.reduce(
    (summary, item) => {
      summary.total += 1;
      summary[item.severity] = (summary[item.severity] ?? 0) + 1;
      return summary;
    },
    { total: 0, error: 0, warning: 0, info: 0 },
  );
}
