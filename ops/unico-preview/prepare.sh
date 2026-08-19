#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_SHA="000ef9ce9e3d28b2b473faf8ef6db17e150b3364"
SOURCE_DIR="ops/unico-preview/source"
HOSTINGER_USERNAME="u242521810"
HOSTINGER_DOMAIN="unico-preview.apidevelopers.digital"

test -n "${HOSTINGER_API_TOKEN:-}"

node - <<'NODE'
const fs=require("fs");
const r=JSON.parse(fs.readFileSync("ops/unico-preview/source/RELEASE.json","utf8"));
if(r.sourceSha!=="000ef9ce9e3d28b2b473faf8ef6db17e150b3364") throw new Error("source_sha_mismatch");
if(r.publicHost!=="unico-preview.apidevelopers.digital") throw new Error("target_mismatch");
if(r.productionHost!=="unico.apidevelopers.digital") throw new Error("production_mismatch");
if(r.secretsIncluded!==false||r.productionMutation!==false) throw new Error("unsafe_release");
NODE

(cd "$SOURCE_DIR" && npm run check)

NODE_ARCHIVE="$RUNNER_TEMP/uni-co-web-${SOURCE_SHA}.zip"
(cd "$SOURCE_DIR" && /usr/bin/zip -X -q -r "$NODE_ARCHIVE" . -x ".git/*" "node_modules/*" ".env" ".env.*" "*.pem" "*.key")
/usr/bin/unzip -t "$NODE_ARCHIVE" >/dev/null
NODE_ARCHIVE_NAME="$(basename "$NODE_ARCHIVE")"

CARRIER_DIR="$RUNNER_TEMP/unico-preview-carrier"
CARRIER="$RUNNER_TEMP/unico-preview-carrier.zip"
rm -rf "$CARRIER_DIR" "$CARRIER"
mkdir -p "$CARRIER_DIR"
printf '%s\n' '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>uni.co preview</title><body>uni.co preview — preparando runtime Node.</body></html>' > "$CARRIER_DIR/index.html"
cp "$NODE_ARCHIVE" "$CARRIER_DIR/$NODE_ARCHIVE_NAME"
(cd "$CARRIER_DIR" && /usr/bin/zip -X -q -r "$CARRIER" .)
/usr/bin/unzip -t "$CARRIER" >/dev/null

{
  printf 'NODE_ARCHIVE=%s\n' "$NODE_ARCHIVE"
  printf 'NODE_ARCHIVE_NAME=%s\n' "$NODE_ARCHIVE_NAME"
  printf 'CARRIER=%s\n' "$CARRIER"
  printf 'HOSTINGER_USERNAME=%s\n' "$HOSTINGER_USERNAME"
  printf 'HOSTINGER_DOMAIN=%s\n' "$HOSTINGER_DOMAIN"
} >> "$GITHUB_ENV"

test -s "$NODE_ARCHIVE"
test -s "$CARRIER"
