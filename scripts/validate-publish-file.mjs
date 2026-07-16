#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import process from "node:process";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const JSON_EXTENSIONS = new Set([".json"]);
const TEXT_EXTENSIONS = new Set([".md", ".mjs", ".js", ".ts", ".tsx", ".yml", ".yaml", ".txt"]);

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
  return args;
}

function validateBase64RoundTrip(buffer) {
  const encoded = buffer.toString("base64");
  const decoded = Buffer.from(encoded, "base64");

  if (!decoded.equals(buffer)) {
    throw new Error("Base64 round-trip validation failed");
  }

  const canonical = decoded.toString("base64");
  if (canonical !== encoded) {
    throw new Error("Base64 canonicalization validation failed");
  }

  return encoded;
}

function validateText(buffer, extension) {
  const text = buffer.toString("utf8");

  if (text.includes("\u0000")) {
    throw new Error("Text file contains NUL bytes");
  }

  if (text.trim().length === 0) {
    throw new Error("Text file is empty");
  }

  if (JSON_EXTENSIONS.has(extension)) {
    JSON.parse(text);
  }

  return text;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) fail("Missing --file");

  const file = resolve(args.file);
  const info = await stat(file);

  if (!info.isFile()) fail("Path is not a regular file", { file });
  if (info.size === 0) fail("File is empty", { file });
  if (info.size > MAX_FILE_BYTES) {
    fail("File exceeds safe GitHub Contents API limit", {
      file,
      bytes: info.size,
      maxBytes: MAX_FILE_BYTES,
    });
  }

  const buffer = await readFile(file);
  const extension = extname(file).toLowerCase();

  if (TEXT_EXTENSIONS.has(extension) || JSON_EXTENSIONS.has(extension)) {
    validateText(buffer, extension);
  }

  const encoded = validateBase64RoundTrip(buffer);
  const sha256 = await crypto.subtle.digest("SHA-256", buffer);
  const digest = Buffer.from(sha256).toString("hex");

  console.log(
    JSON.stringify(
      {
        ok: true,
        file,
        bytes: buffer.length,
        extension,
        sha256: digest,
        base64Length: encoded.length,
        roundTripValidated: true,
        jsonValidated: JSON_EXTENSIONS.has(extension),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => fail(error.message));
