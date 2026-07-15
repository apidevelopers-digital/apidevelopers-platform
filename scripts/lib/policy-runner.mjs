import { readFile } from "node:fs/promises";
import path from "node:path";

const MATURITY_ORDER = new Map([
  ["L1", 0],
  ["L1", 1],
  ["L2", 2],
  ["L3", 3],
  ["L4", 4],
  ["L5", 5],
  ["L6", 6],
]);

function diagnostic({
  capability,
  code,
  message,
  recommendation = null,
  evidence = null,
  severity = "warning",
}) {
  return {
    schemaVersion: 1,
    capability: capability ?? null,
    validator: "PolicyRunner",
    severity,
    code,
    message,
    recommendation,
    evidence,
    documentation: null,
  };
}

export async function loadValidationPolicies(
  configPath = "config/validation-policies.json",
  rootDir = process.cwd(),
) {
  const absolutePath = path.resolve(rootDir, configPath);
  const raw = await readFile(absolutePath, "utf8");
  const config = JSON.parse(raw);

  if (config.schemaVersion !== 1 || typeof config.profiles !== "object") {
    throw new Error(`invalid validation policy configuration: ${configPath}`);
  }

  return config;
}

export function resolvePolicyProfile(config, requestedProfile = null) {
  const profileName = requestedProfile ?? config.defaultProfile;
  const profile = config.profiles?.[profileName];

  if (!profile) {
    throw new Error(`validation profile not found: ${profileName}`);
  }

  return { profileName, profile };
}

function hasVersionedEvents(manifest) {
  const events = [
    ...(Array.isArray(manifest.publishes) ? manifest.publishes : []),
    ...(Array.isArray(manifest.consumes) ? manifest.consumes : []),
  ];
  return events.every((event) => typeof event === "string" && /\.v[1-9][0-9]*$/.test(event));
}

function hasDeclaredTests(manifest) {
  return typeof manifest?.paths?.tests === "string" && manifest.paths.tests.trim() !== "";
}

function hasDeclaredObservability(manifest) {
  return Boolean(manifest?.observability && typeof manifest.observability === "object");
}

export function runPolicies(manifests, profileName, profile) {
  const diagnostics = [];
  const policies = profile.policies ?? {};

  for (const manifest of manifests) {
    const capability = manifest.id ?? null;

    if (policies.requireReadme && !manifest?.paths?.readme) {
      diagnostics.push(diagnostic({
        capability,
        code: "POLICY_README_REQUIRED",
        message: `${capability ?? "unknown"} must declare paths.readme`,
        recommendation: "Declare the README path in the capability manifest.",
      }));
    }

    if (policies.requireOwner && (!manifest.owner || manifest.owner.trim() === "")) {
      diagnostics.push(diagnostic({
        capability,
        code: "POLICY_OWNER_REQUIRED",
        message: `${capability ?? "unknown"} must declare an owner`,
        recommendation: "Assign an accountable engineering owner.",
        severity: "error",
      }));
    }

    if (policies.requireVersionedEvents && !hasVersionedEvents(manifest)) {
      diagnostics.push(diagnostic({
        capability,
        code: "POLICY_EVENT_VERSION_REQUIRED",
        message: `${capability ?? "unknown"} contains an event without a .vN suffix`,
        recommendation: "Version every published and consumed event.",
        severity: "error",
      }));
    }

    if (policies.requireTests && !hasDeclaredTests(manifest)) {
      diagnostics.push(diagnostic({
        capability,
        code: "POLICY_TESTS_REQUIRED",
        message: `${capability ?? "unknown"} must declare paths.tests for profile ${profileName}`,
        recommendation: "Generate and declare the capability test suite.",
      }));
    }

    if (policies.requireObservability && !hasDeclaredObservability(manifest)) {
      diagnostics.push(diagnostic({
        capability,
        code: "POLICY_OBSERVABILITY_REQUIRED",
        message: `${capability ?? "unknown"} must declare observability metadata for profile ${profileName}`,
        recommendation: "Declare logs, metrics and traces requirements in the manifest.",
      }));
    }

    const minimum = policies.minimumMaturityForRelease;
    if (minimum && MATURITY_ORDER.has(minimum)) {
      const actual = MATURITY_ORDER.get(manifest.maturity);
      if (actual === undefined || actual < MATURITY_ORDER.get(minimum)) {
        diagnostics.push(diagnostic({
          capability,
          code: "POLICY_MATURITY_BELOW_MINIMUM",
          message: `${capability ?? "unknown"} maturity ${manifest.maturity ?? "unknown"} is below ${minimum}`,
          recommendation: `Promote the capability only after meeting ${minimum} evidence requirements.`,
          evidence: { actual: manifest.maturity ?? null, required: minimum },
          severity: "error",
        }));
      }
    }
  }

  return diagnostics;
}

export function shouldFailPolicyRun(diagnostics, profile) {
  const failOn = new Set(profile.failOn ?? ["error"]);
  return diagnostics.some((item) => failOn.has(item.severity));
}
