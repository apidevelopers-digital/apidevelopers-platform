#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const HOSTINGER_API_BASE = "https://developers.hostinger.com";
const PARENT = "apidevelopers.digital";
const PUBLIC = "mitra-preview.apidevelopers.digital";
const PREFIX = "mitra-preview";
const PHRASE = "IGOR_APROVA_MITRA_PREVIEW_DEPLOY";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] || "") : fallback;
}

async function walk(root, rel = "") {
  const out = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const abs = path.join(root, entry.name);
    const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`symlink_not_allowed:${nextRel}`);
    if (entry.isDirectory()) out.push(...await walk(abs, nextRel));
    else if (entry.isFile()) out.push({ abs, rel: nextRel });
  }
  return out;
}

async function getUploadCredentials(token, username) {
  const response = await fetch(`${HOSTINGER_API_BASE}/api/hosting/v1/files/upload-urls`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ username, domain: PARENT }),
  });
  if (response.status !== 200) {
    throw new Error(`generate_upload_url_failed:${response.status}`);
  }
  const data = await response.json();
  if (!data?.url || !data?.auth_key || !data?.rest_auth_key) {
    throw new Error("upload_credentials_missing");
  }
  return {
    url: String(data.url),
    a: String(data.auth_key),
    r: String(data.rest_auth_key),
  };
}

async function upload(credentials, local, remote) {
  const body = await fs.readFile(local);
  const url = `${credentials.url.replace(/\/+$/, "")}/${remote
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?override=true`;
  const headers = {
    "X-Auth": credentials.a,
    "X-Auth-Rest": credentials.r,
    "Tus-Resumable": "1.0.0",
  };

  let response = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "Upload-Length": String(body.length),
      "Upload-Offset": "0",
    },
  });
  if (response.status !== 201) {
    throw new Error(`tus_create_failed:${remote}:${response.status}`);
  }

  response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...headers,
      "Content-Type": "application/offset+octet-stream",
      "Upload-Offset": "0",
    },
    body,
  });
  if (response.status !== 204) {
    throw new Error(`tus_patch_failed:${remote}:${response.status}`);
  }
}

async function probe() {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetch(`https://${PUBLIC}/?probe=${Date.now()}`, {
        cache: "no-store",
      });
      const text = await response.text();
      if (response.ok && /Mitra/i.test(text)) {
        return { ok: true, status: response.status };
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return { ok: false };
}

async function main() {
  const mode = arg("mode", "preflight");
  const dist = path.resolve(arg("dist"));
  const evidence = path.resolve(arg("evidence", "mitra-preview-evidence.json"));

  if (!["preflight", "apply"].includes(mode)) throw new Error("bad_mode");
  if (!dist || !fsSync.existsSync(dist)) throw new Error("dist_missing");

  const files = await walk(dist);
  if (!files.some((file) => file.rel === "index.html")) throw new Error("index_missing");
  const html = await fs.readFile(path.join(dist, "index.html"), "utf8");
  if (!/Mitra/i.test(html)) throw new Error("mitra_marker_missing");

  const ev = {
    mode,
    target: { parent: PARENT, public: PUBLIC, prefix: PREFIX },
    fileCount: files.length,
    writeExecuted: false,
    stage: "validated_build",
    status: "ready",
  };

  if (mode === "preflight") {
    await fs.writeFile(evidence, JSON.stringify(ev, null, 2));
    console.log(JSON.stringify(ev));
    return;
  }

  const token = process.env.HOSTINGER_API_TOKEN || "";
  const username = process.env.TARGET_HOSTINGER_USERNAME || "";
  if (!token) throw new Error("hostinger_token_missing");
  if (!username) throw new Error("hostinger_username_missing");
  if (arg("approved-sha") !== process.env.GITHUB_SHA) {
    throw new Error("approved_sha_mismatch");
  }
  if (arg("approval") !== PHRASE) throw new Error("approval_phrase_mismatch");

  try {
    ev.stage = "generate_upload_url";
    const credentials = await getUploadCredentials(token, username);

    ev.stage = "upload_files";
    const ordered = [...files].sort((a, b) =>
      a.rel === "index.html" ? 1 : b.rel === "index.html" ? -1 : a.rel.localeCompare(b.rel)
    );
    for (const file of ordered) {
      await upload(credentials, file.abs, `${PREFIX}/${file.rel}`);
    }
    ev.writeExecuted = true;

    ev.stage = "public_probe";
    ev.probe = await probe();
    if (!ev.probe.ok) throw new Error("public_probe_failed");

    ev.stage = "completed";
    ev.status = "completed_and_public";
    await fs.writeFile(evidence, JSON.stringify(ev, null, 2));
    console.log(JSON.stringify(ev));
  } catch (error) {
    ev.status = "error";
    ev.error = error?.message || String(error);
    await fs.writeFile(evidence, JSON.stringify(ev, null, 2));
    console.error(JSON.stringify(ev));
    process.exitCode = 1;
  }
}

await main();
