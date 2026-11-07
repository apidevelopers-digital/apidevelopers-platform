import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildManagedHostingArtifact } from "../scripts/build-managed-hosting-artifact.mjs";

test("managed Hostinger artifact carries disabled retrieval bootstrap without provider bundle", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "api-gateway-retrieval-bootstrap-artifact-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  const artifactDirectory = join(directory, "artifact");
  await buildManagedHostingArtifact({
    outputDirectory: artifactDirectory,
    sourceRevision: "retrieval-bootstrap-artifact-test",
  });

  const hostingerEntry = await readFile(
    join(artifactDirectory, "src/hostinger-entry.mjs"),
    "utf8",
  );
  assert.match(
    hostingerEntry,
    /\.\/retrieval-operational-bootstrap\.mjs/,
  );
  assert.doesNotMatch(hostingerEntry, /retrieval-operational-bootstrap\.emjs/);

  await access(
    join(artifactDirectory, "src/retrieval-operational-bootstrap.mjs"),
  );

  const bootstrap = await readFile(
    join(artifactDirectory, "src/retrieval-operational-bootstrap.mjs"),
    "utf8",
  );
  assert.doesNotMatch(bootstrap, /\.\/retrieval-runtime\.mjs/);
  assert.match(bootstrap, /RETRIEVAL_ENABLED=true requires an explicit governed runtime factory/);
  assert.match(bootstrap, /RETRIEVAL_RUNTIME_DISABLED/);
});
