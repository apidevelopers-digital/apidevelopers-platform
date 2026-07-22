import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const directory = "tests/integration";
const tests = readdirSync(directory)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join(directory, name));

for (const testFile of tests) {
  console.log(`::group::${testFile}`);
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=spec", testFile],
    { stdio: "inherit" },
  );
  console.log("::endgroup::");

  if (result.status !== 0) {
    console.error(`Integration test failed: ${testFile}`);
    process.exit(result.status ?? 1);
  }
}
