#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

function fail(message, details = null) {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) args[key] = true;
    else {
      args[key] = value;
      index += 1;
    }
  }
  return args;
}

function encodeBase64(buffer) {
  const encoded = buffer.toString("base64");
  const decoded = Buffer.from(encoded, "base64");

  if (!decoded.equals(buffer)) {
    throw new Error("Base64 round-trip validation failed");
  }

  return encoded;
}

async function githubRequest(url, { method = "GET", token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok && response.status !== 404) {
    throw new Error(`GitHub API ${response.status}: ${payload?.message ?? text}`);
  }

  return { status: response.status, payload };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;

  if (!token) fail("Missing GITHUB_TOKEN");
  if (!args.owner) fail("Missing --owner");
  if (!args.repo) fail("Missing --repo");
  if (!args.branch) fail("Missing --branch");
  if (!args.file) fail("Missing --file");
  if (!args.path) fail("Missing --path");
  if (!args.message) fail("Missing --message");

  const localFile = resolve(args.file);
  const source = await readFile(localFile);
  const content = encodeBase64(source);

  const apiBase =
    `https://api.github.com/repos/${encodeURIComponent(args.owner)}` +
    `/${encodeURIComponent(args.repo)}/contents/${args.path.split("/").map(encodeURIComponent).join("/")}`;

  const lookup = await githubRequest(
    `${apiBase}?ref=${encodeURIComponent(args.branch)}`,
    { token },
   );

  const payload = {
    message: args.message,
    content,
    branch: args.branch,
  };

  if (lookup.status === 200 && lookup.payload?.sha) {
    payload.sha = lookup.payload.sha;
  }

  if (args.authorName && args.authorEmail) {
    payload.author = { name: args.authorName, email: args.authorEmail };
    payload.committer = { name: args.authorName, email: args.authorEmail };
  }

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          operation: payload.sha ? "update" : "create",
          localFile,
          targetPath: args.path,
          branch: args.branch,
          bytes: source.length,
          base64Length: content.length,
          roundTripValidated: true,
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = await githubRequest(apiBase, {
    method: "PUT",
    token,
    body: payload,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        operation: payload.sha ? "update" : "create",
        path: result.payload?.content?.path ?? args.path,
        branch: args.branch,
        commit: result.payload?.commit?.sha ?? null,
        blob: result.payload?.content?.sha ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => fail(error.message));