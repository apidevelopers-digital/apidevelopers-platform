import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadContract, validateAgainstContract } from "./lib/contract-validation.mjs";
import { generateCapabilityReadme } from "./lib/generate-capability-readme.mjs";

const rootDir = process.cwd();
const executionContractPath = "contracts/execution/execution-plan.schema.json";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function loadJson(filePath) {
  return JSON.parse(await readFile(path.resolve(rootDir, filePath), "utf8"));
}

function assertKnownAction(action) {
  const known = new Set(["generate-readme", "update-capability-catalog"]);
  if (!known.has(action.type)) {
    throw new Error(`unknown factory action: ${action.type}`);
  }
}

async function executeAction({ action, manifest, write, overwrite }) {
  assertKnownAction(action);
  const startedAt = new Date().toISOString();

  if (action.type === "generate-readme") {
    const result = await generateCapabilityReadme({
      manifest,
      rootDir,
      write,
      overwrite,
    });
    return {
      type: action.type,
      target: action.target,
      status: result.written ? "completed" : "planned",
      startedAt,
      finishedAt: new Date().toISOString(),
      result: {
        written: result.written,
        target: result.target,
      },
    };
  }

  return {
    type: action.type,
    target: action.target,
    status: "skipped",
    startedAt,
    finishedAt: new Date().toISOString(),
    result: {
      reason: "catalog generator is not implemented",
    },
  };
}

async function main() {
  const planPath = readArg("--plan");
  const manifestPath = readArg("--manifest");
  const write = hasFlag("--write");
  const overwrite = hasFlag("--overwrite");

  if (!planPath || !manifestPath) {
    fail("usage: node scripts/run-factory-plan.mjs --plan <path> --manifest <path> [--write] [--overwrite]");
    return;
  }

  const [plan, manifest, executionContract] = await Promise.all([
    loadJson(planPath),
    loadJson(manifestPath),
    loadContract(executionContractPath, rootDir),
  ]);

  const diagnostics = validateAgainstContract(plan, executionContract, {
    capability: plan.capability ?? manifest.id ?? null,
  });

  if (diagnostics.some((item) => item.severity === "error")) {
    for (const item of diagnostics) {
      console.error(`- [${item.code}] ${item.message}`);
    }
    fail("execution plan does not satisfy the Execution Contract");
    return;
  }

  if (plan.capability !== manifest.id) {
    fail(`plan capability ${plan.capability} does not match manifest ${manifest.id}`);
    return;
  }

  if (write && plan.mode !== "execute") {
    fail("write execution requires plan.mode=execute");
    return;
  }

  const tasks = [];
  for (const action of plan.actions) {
    tasks.push(await executeAction({ action, manifest, write, overwrite }));
  }

  const report = {
    schemaVersion: 1,
    capability: manifest.id,
    mode: write ? "execute" : "plan",
    startedAt: tasks[0]?.startedAt ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: tasks.some((task) => task.status === "failed") ? "failed" : "completed",
    tasks,
  };

  const outputPath = path.resolve(
    rootDir,
    "generated/factory-runs",
   `${manifest.id}.run.json`,
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`factory run recorded: ${path.relative(rootDir, outputPath)}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
