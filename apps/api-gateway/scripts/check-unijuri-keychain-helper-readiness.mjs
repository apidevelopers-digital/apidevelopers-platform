import { access } from "node:fs/promises";
import { constants } from "node:fs";

const path = "/usr/local/libexec/apidevelopers/operator-keychain-helper";

let state = "absent";
try {
  await access(path, constants.X_OK);
  state = "present-executable";
} catch {
  try {
    await access(path, constants.F_OK);
    state = "present-not-executable";
  } catch {
    state = "absent";
  }
}

process.stdout.write(`::notice title=UniJuri keychain helper::helperExecutable=${state}\n`);
process.exitCode = 0;
