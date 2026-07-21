import path from "node:path";

import { normalizeRepositoryPath } from "./repository.mjs";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveExportEntry(exportsValue, exportKey) {
  if (exportKey === ".") {
    if (
      typeof exportsValue === "string" ||
      exportsValue === null ||
      Array.isArray(exportsValue)
    ) {
      return { found: true, value: exportsValue };
    }

    if (isPlainObject(exportsValue)) {
      if (Object.prototype.hasOwnProperty.call(exportsValue, ".")) {
        return { found: true, value: exportsValue["."] };
      }

      const keys = Object.keys(exportsValue);
      const hasSubpathKeys = keys.some((key) => key.startsWith("."));
      return hasSubpathKeys
        ? { found: false, value: undefined }
        : { found: true, value: exportsValue };
    }

    return { found: false, value: undefined };
  }

  if (
    isPlainObject(exportsValue) &&
    Object.prototype.hasOwnProperty.call(exportsValue, exportKey)
  ) {
    return { found: true, value: exportsValue[exportKey] };
  }

  return { found: false, value: undefined };
}

function collectExportTargets(value, trail = [], output = []) {
  if (typeof value === "string" || value === null) {
    output.push({ value, trail: [...trail] });
    return output;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      collectExportTargets(item, [...trail, String(index)], output);
    }
    return output;
  }

  if (isPlainObject(value)) {
    for (const key of Object.keys(value).sort()) {
      collectExportTargets(value[key], [...trail, key], output);
    }
    return output;
  }

  output.push({ value, trail: [...trail] });
  return output;
}

function resolvePackageTarget(manifestPath, target) {
  if (typeof target !== "string" || !target.startsWith("./")) {
    return { valid: false, reason: "TARGET_MUST_BE_PACKAGE_RELATIVE" };
  }

  if (target.includes("*")) {
    return { valid: false, reason: "TARGET_PATTERN_UNSUPPORTED" };
  }

  const packageDirectory = path.posix.dirname(manifestPath);
  const resolved = normalizeRepositoryPath(
    path.posix.join(packageDirectory, target.slice(2)),
  );

  if (
    resolved === packageDirectory ||
    !resolved.startsWith(`${packageDirectory}/`)
  ) {
    return { valid: false, reason: "TARGET_ESCAPES_PACKAGE" };
  }

  return { valid: true, path: resolved };
}

export function createExportContractAdapter({ readText, exists, createFinding, selectTargets }) {
  return async function exportContract({ rule, targets }) {
    const findings = [];
    const requiredKeys = [...new Set(rule?.parameters?.requiredKeys ?? ["."])].sort();
    const requireExistingTargets =
      rule?.parameters?.requireExistingTargets !== false;
    const allowNullTargets = rule?.parameters?.allowNullTargets === true;

    for (const target of selectTargets(rule, targets)) {
      const document = JSON.parse(await readText(target));
      const exportsValue = document?.exports;

      for (const exportKey of requiredKeys) {
        const entry = resolveExportEntry(exportsValue, exportKey);

        if (!entry.found) {
          findings.push(createFinding(rule, {
            path: target,
            observed: { found: false, exportKey },
            expected: { found: true, exportKey },
          }));
          continue;
        }

        const exportTargets = collectExportTargets(entry.value)
          .sort((a, b) =>
            String(a.value).localeCompare(String(b.value)) ||
            a.trail.join("/").localeCompare(b.trail.join("/")),
          );

        if (exportTargets.length === 0) {
          findings.push(createFinding(rule, {
            path: target,
            observed: { exportKey, targetCount: 0 },
            expected: { exportKey, targetCountAtLeast: 1 },
          }));
          continue;
        }

        for (const exportTarget of exportTargets) {
          if (exportTarget.value === null && allowNullTargets) continue;

          const resolved = resolvePackageTarget(target, exportTarget.value);

          if (!resolved.valid) {
            findings.push(createFinding(rule, {
              path: target,
              observed: {
                exportKey,
                target: exportTarget.value,
                conditionPath: exportTarget.trail,
                valid: false,
                reason: resolved.reason,
              },
              expected: {
                exportKey,
                packageRelative: true,
                existingTarget: requireExistingTargets,
              },
            }));
            continue;
          }

          if (requireExistingTargets && !(await exists(resolved.path))) {
            findings.push(createFinding(rule, {
              path: resolved.path,
              observed: {
                exportKey,
                target: exportTarget.value,
                conditionPath: exportTarget.trail,
                exists: false,
                manifestPath: target,
              },
              expected: {
                exportKey,
                exists: true,
                manifestPath: target,
              },
            }));
          }
        }
      }
    }

    return findings;
  };
}
