import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const type = args.get("--type");
const name = args.get("--name");
const write = process.argv.includes("--write");

const roots = {
  service: "services",
  engine: "engines",
  package: "packages",
  app: "apps",
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!roots[type]) {
  fail("--type must be one of: service, engine, package, app");
} else if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  fail("--name must use lowercase kebab-case");
} else {
  const target = path.resolve(roots[type], name);

  try {
    await access(target);
    fail(`target already exists: ${path.relative(process.cwd(), target)}`);
  } catch {
    const displayName = `AP ${name
      .split("-")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ")}`;

    const files = {
      "README.md": `# ${displayName}

Status: Foundation v1
Owner: API Developers.digital
Maturity: L0 -> L1

## Mission

Describe the reusable capability owned by this domain.

## Responsibilities

- define the canonical contract;
- preserve tenant isolation;
- emit events and audit evidence when applicable;
- remain independent from product-specific brands and workflows.

## Out of scope

- product-specific business rules;
- provider secrets;
- direct production deployment.

## Completion criteria

- architecture documented;
- contracts versioned;
- implementation created;
- tests passing;
- security and observability defined.
`,
      "capability.json": `${JSON.stringify(
        {
          schemaVersion: 1,
          name,
          displayName,
          type,
          owner: "API Developers.digital",
          maturity: "L0",
          status: "planned",
          multiTenant: true,
          auditRequired: true,
          productIndependent: true,
        },
        null,
        2,
      )}
`,
    };

    console.log(`${write ? "creating" : "dry-run"}: ${path.relative(process.cwd(), target)}`);
    for (const file of Object.keys(files)) {
      console.log(`- ${file}`);
    }

    if (write) {
      await mkdir(target, { recursive: true });
      await Promise.all(
        Object.entries(files).map(([file, data]) =>
          writeFile(path.join(target, file), data, { flag: "wx" }),
        ),
      );
      console.log("domain created");
    } else {
      console.log("no files written; pass --write to execute");
    }
  }
}
