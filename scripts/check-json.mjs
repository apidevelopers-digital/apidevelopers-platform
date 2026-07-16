import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = ["contracts", "capabilities"];

async function collect(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await collect(target));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(target);
  }
  return files;
}

const files = (await Promise.all(roots.map(collect))).flat().sort();
const failures = [];
for (const file of files) {
  try {
    JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`JSON validation passed for ${files.length} file(s).`);
