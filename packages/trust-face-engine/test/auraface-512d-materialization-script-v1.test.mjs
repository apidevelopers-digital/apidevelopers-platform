import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(
  new URL("../scripts/materialize-auraface-512d-once.sh", import.meta.url),
);

test("AuraFace 512D one-shot materializer has valid Bash syntax", () => {
  const output = execFileSync("/bin/bash", ["-n", scriptPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  assert.equal(output, "");
});
