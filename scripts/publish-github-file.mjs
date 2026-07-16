#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const REAL_CONFIRMATION = "PUBLISH_GITHUB_FILE_REAL";
const TEXT_EXTENSIONS = new Set([".md", ".mjs", ".js", ".ts", ".tsx", ".json", ".yml", ".yaml", ".txt"]);

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
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;}

function encodeBase64(buffer) {
  const encoded = buffer.toString("base64");
  const decoded = Buffer.from(encoded, "base64");
  if (!decoded.equals(buffer)) throw new Error("Base64 round-trip validation failed");
  if (decoded.toString("base64") !== encoded) throw new Error("Base64 canonicalization failed");
  return encoded;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function validateText(buffer, extension) {
  const text = buffer.toString("utf8");
  if (text.includes("\u0000")) throw new Error("Text file contains NUL bytes");
  if (text.trim().length === 0) throw new Error("Text file is empty");
  if (extension === ".json") JSON.parse(text);
}

async function validateFile(file) {
  const absolute = resolve(file);
  const info = await stat(absolute);
  if (!info.isFile()) throw new Error("Path is not a regular file");
  if (info.size === 0) throw new Error("File is empty");
  if (info.size > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} byte safe limit`);
  const buffer = await readFile(absolute);
  const extension = extname(absolute).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) validateText(buffer, extension);
  return { absolute, buffer, extension, bytes: buffer.length, digest: sha256(buffer), content: encodeBase64(buffer) };
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
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!response.ok && response.status !== 404) throw new Error(`GitHub API ${response.status}: ${payload?.message ?? text}`);
  return { status: response.status, payload };
}

function contentUrl({ owner, repo, path, branch }) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
}

async function verifyPublished({ owner, repo, path, branch, token, expectedDigest }) {
  const response = await githubRequest(contentUrl({ owner, repo, path, branch }), { token });
  if (response.status !== 200 || !response.payload?.content) throw new Error("Post-publish verification could not retrieve content");
  const remote = Buffer.from(response.payload.content.replace(/\s/g, ""), "base64");
  const remoteDigest = sha256(remote);
  if (remoteDigest !== expectedDigest) throw new Error(`Post-publish digest mismatch: expected ${expectedDigest}, got ${remoteDigest}`);
  return { blobSha: response.payload.sha, bytes: remote.length, sha256: remoteDigest };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;
  for (const name of ["owner", "repo", "branch", "file", "path", "message"]) if (!args[name]) fail(`Missing --${name}`);
  if (!token) fail("Missing GITHUB_TOKEN");

  const validated = await validateFile(args.file);
  const lookup = await githubRequest(contentUrl(args), { token });
  const operation = lookup.status === 200 ? "update" : "create";
  const audit = { owner: args.owner, repo: args.repo, branch: args.branch, localFile: validated.absolute, targetPath: args.path, operation, bytes: validated.bytes, sha256: validated.digest, base64Length: validated.content.length, roundTripValidated: true, jsonValidated: validated.extension === ".json" };

  if (args.confirm !== REAL_CONFIRMATION) {
    console.log(JSON.stringify({ ok: true, mode: "dry-run", confirmationRequired: REAL_CONFIRMATION, audit }, null, 2));
    return;
  }

  const endpoint = contentUrl(args).replace(/\?ref=.*$/, "");
  const body = { message: args.message, content: validated.content, branch: args.branch, ...(lookup.status === 200 && lookup.payload?.sha ? { sha: lookup.payload.sha } : {}) };
  if (args.authorName && args.authorEmail) { body.author = { name: args.authorName, email: args.authorEmail }; body.committer = { ...body.author }; }

  const published = await githubRequest(endpoint, { method: "PUT", token, body });
  const verification = await verifyPublished({ owner: args.owner, repo: args.repo, path: args.path, branch: args.branch, token, expectedDigest: validated.digest });
  console.log(JSON.stringify({ ok: true, mode: "real", audit: { ...audit, commitSha: published.payload?.commit?.sha ?? null, verified: true, verification } }, null, 2));
}

main().catch((error) => fail(error.message));