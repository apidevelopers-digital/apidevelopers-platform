import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) {
  throw new TypeError("preflight result path is required");
}

const parsed = JSON.parse(await readFile(path, "utf8"));
const item = Array.isArray(parsed?.checks)
  ? parsed.checks.find((check) => check?.id === "keychain_item_present")
  : null;
const keychainItem = item?.detail === "present" ? "present" : "absent";

process.stdout.write(
  `::notice title=UniJuri preflight::safeToProvision=${Boolean(parsed?.safeToProvision)}; writesPerformed=${Boolean(parsed?.writesPerformed)}; keychainItem=${keychainItem}\n`,
);
