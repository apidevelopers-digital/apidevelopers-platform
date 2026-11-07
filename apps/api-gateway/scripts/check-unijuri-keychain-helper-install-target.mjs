import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";

const targetDir = "/usr/local/libexec/apidevelopers";
const targetPath = `${targetDir}/operator-keychain-helper`;

let dirState = "absent";
let writable = false;
try {
  const info = await stat(targetDir);
  dirState = info.isDirectory() ? "present-directory" : "present-not-directory";
  if (info.isDirectory()) {
    try {
      await access(targetDir, constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
  }
} catch {
  dirState = "absent";
}

process.stdout.write(
  `::notice title=UniJuri helper install target::targetDir=${dirState}; writable=${writable}; targetPath=${targetPath}\n`,
);
