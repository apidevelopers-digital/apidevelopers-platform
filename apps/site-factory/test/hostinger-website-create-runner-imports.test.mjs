import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const githubModuleUrl = new URL(
  "../src/hostinger-website-create-github.mjs",
  import.meta.url,
);
const runnerUrls = [
  new URL("../src/run-hostinger-website-create-claim.mjs", import.meta.url),
  new URL("../src/run-hostinger-website-create-executor.mjs", import.meta.url),
];

test("website create runners use the canonical readGithubJson export", async () => {
  const githubModuleSource = await readFile(githubModuleUrl, "utf8");
  assert.match(
    githubModuleSource,
    /export async function readGithubJson\b/,
  );

  for (const runnerUrl of runnerUrls) {
    const runnerSource = await readFile(runnerUrl, "utf8");
    assert.match(runnerSource, /\breadGithubJson\b/);
    assert.doesNotMatch(runnerSource, /\breadGitHubJson\b/);
  }
});
