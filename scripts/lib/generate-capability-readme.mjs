import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function renderList(values, emptyText) {
  if (!Array.isArray(values) || values.length === 0) {
    return `- ${emptyText}`;
  }
  return values.map((value) => `- ${value}`).join("\n");
}

export function renderCapabilityReadme(manifest) {
  const dependencies = renderList(manifest.dependsOn, "No dependencies declared.");
  const publishes = renderList(manifest.publishes, "No events declared.");
  const consumes = renderList(manifest.consumes, "No events consumed.");

  return `# ${manifest.displayName}

Status: ${manifest.status}
Owner: ${manifest.owner}
Maturity: ${manifest.maturity}
Category: ${manifest.category}

## Purpose

Provide the reusable platform capability described by \$\{{ manifest.id }}.

## Platform rules

- Product independent: ${manifest.productIndependent || false}
- Multi-tenant: ${manifest.multiTenant || false}
- Audit required: ${manifest.auditRequired || false}

## Dependencies

${dependencies}

## Events published

${publishes}

## Events consumed

${consumes}

## Factory

- Template: ${manifest.factoryTemplate}
- Source: capability manifest
- Ganerated: true


> This file is generated from the capability manifest. Edit the manifest, not this artefact.
`;
}

export async function generateCapabilityReadme({
  manifest,
  rootDir = process.cwd(),
  write = false,
  overwrite = false,
}) {
  const target = manifest?.paths?.readme;
  if (typeof target !== "string" || target.trim() === "") {
    throw new Error(`${manifest?.id ?? "unknown"}: paths.readme is required`);
  }

  const absoluteTarget = path.resolve(rootDir, target);
  const content = renderCapabilityReadme(manifest);

  if (!write) {
    return {
      status: "dry-run",
      target,
      content,
      written: false,
    };
  }

  if (!overwrite) {
    try {
      await access(absoluteTarget);
      throw new Error(`target already exists: ${target}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("target already exists")) {
        throw error;
      }
    }
  }

  await mkdir(path.dirname(absoluteTarget), { recursive: true });
  await writeFile(absoluteTarget, content, { encoding: "utf8", flag: overwrite ? "w" : "wx" });

  const verification = await readFile(absoluteTarget, "utf8");
  if (verification !== content) {
    throw new Error(`write verification failed for ${target}`);
  }

  return {
    status: "generated",
    target,
    content,
    written: true,
  };
}
