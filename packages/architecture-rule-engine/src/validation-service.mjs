import {
  runRuleEngine,
  stableStringify,
} from "./index.mjs";
import { createBuiltinAdapters } from "./adapters.mjs";
import { loadRuleEngineRuntime } from "./loaders.mjs";

export const DEFAULT_RULESET_DESCRIPTOR = Object.freeze({
  path: "architecture/rulesets/architecture-core.v1.json",
  expectedId: "architecture-core",
  expectedVersion: "1.1.0",
});

export const DEFAULT_EXCEPTION_DESCRIPTOR = Object.freeze({
  path: "architecture/exceptions/snapshot.v1.json",
  required: false,
});

export function buildArchitectureValidationInput({
  owner = "sitedauni",
  name = "apidevelopers-platform",
  branch,
  commitSha,
  workspacePath = ".",
  scope = {},
  mode = "local",
  failThreshold = "ERROR",
  outputDirectory = "artifacts/architecture",
  ruleset = DEFAULT_RULESET_DESCRIPTOR,
  exceptions = DEFAULT_EXCEPTION_DESCRIPTOR,
} = {}) {
  if (!branch) throw new TypeError("branch is required.");
  if (!/^[0-9a-f]{40}$/.test(commitSha ?? "")) {
    throw new TypeError("commitSha must be a lowercase 40-character Git SHA.");
  }

  const scopeMode = scope.mode ?? "repository";
  const normalizedScope = {
    mode: scopeMode,
    include: [...(scope.include ?? ["**"])],
    exclude: [...(scope.exclude ?? [
      ".git/**",
      "node_modules/**",
      "artifacts/**",
    ])],
  };

  if (scopeMode === "changed-files") {
    normalizedScope.baseSha = scope.baseSha;
    normalizedScope.headSha = scope.headSha;
  }

  if (scopeMode === "paths") {
    normalizedScope.paths = [...(scope.paths ?? [])];
  }

  return {
    schemaVersion: "1.0.0",
    repository: {
      provider: "github",
      owner,
      name,
      branch,
      commitSha,
      workspacePath,
    },
    ruleset: { ...ruleset },
    exceptions: { ...exceptions },
    scope: normalizedScope,
    execution: {
      mode,
      failThreshold,
      parallelism: 1,
      timeoutMs: 300000,
    },
    outputs: {
      directory: outputDirectory,
      json: true,
      markdown: false,
      sarif: false,
    },
  };
}

export async function validateArchitecture({
  input,
  repository,
  changedFiles = [],
  clock,
} = {}) {
  if (!repository) throw new TypeError("repository is required.");

  const runtime = await loadRuleEngineRuntime(input, {
    readText: repository.readText,
    listFiles: repository.listFiles,
    changedFiles,
  });

  const report = await runRuleEngine(input, {
    ruleset: runtime.ruleset,
    exceptions: runtime.exceptions,
    resolvedFiles: runtime.resolvedFiles,
    adapters: createBuiltinAdapters(repository),
    clock,
  });

  return Object.freeze({
    report,
    canonicalJson: `${stableStringify(report)}\n`,
    runtime: Object.freeze({
      loadState: runtime.loadState,
      resolvedFileCount: runtime.resolvedFiles.length,
    }),
  });
}
