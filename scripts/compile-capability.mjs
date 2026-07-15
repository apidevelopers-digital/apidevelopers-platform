import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { validateManifestShape } from "./lib/capability-validation.mjs";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function buildPlan(manifest) {
  const actions = [];
  const readmePath = manifest?.paths?.readme;

  if (typeof readmePath === "string" && readmePath.trim() !== "") {
    actions.push({
      type: "generate-readme",
      target: readmePath,
    });
  }

  actions.push({
    type: "update-capability-catalog",
    target: "generated/capability-catalog.json",
  });

  return {
    schemaVersion: 1,
    capability: manifest.id,
    manifestSchemaVersion: manifest.schemaVersion,
    mode: "plan",
    actions,
  };
}

async function main() {
  const manifestPath = readArg("--manifest");
  const write = process.argv.includes("--write");

  if (!manifestPath) {
    fail("usage: node scripts/compile-capability.mjs --manifest <path> [--write]");
    return;
  }

  try {
    const absoluteManifestPath = path.resolve(manifestPath);
    const raw = await readFile(absoluteManifestPath, "utf8");
    const manifest = JSON.parse(raw);
    const diagnostics = validateManifestShape(manifest, manifestPath);

    if (diagnostics.some((item) => item.severity === "error")) {
      fail(`capability manifest is invalid: ${manifestPath}`);
      for (const item of diagnostics) {
        console.error(`- [${item.code}] ${item.message}`);
      }
      return;
    }

    const plan = buildPlan(manifest);
    const output = `${JSON.stringify(plan, null, 2)}\n\;

    if (!write) {
      console.log(output);
      console.log("no files written; pass --write to persist the plan");
      return;
    }

    const planPath = path.resolve("generated/factory-plans", `${manifest.id}.plan.json`);
    await mkdir(path.dirname(planPath), { recursive: true });
    await writeFile(planPath, output, { encoding: "utf8", flag: "wx" });
    console.log(`factory plan created: ${path.relative(process.cwd(), planPath)}`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

await main();
