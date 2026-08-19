#!/usr/bin/env bash
set -Eeuo pipefail

HOSTINGER_USERNAME="u242521810"
HOSTINGER_DOMAIN="unico-preview.apidevelopers.digital"
SOURCE_SHA="000ef9ce9e3d28b2b473faf8ef6db17e150b3364"
SOURCE_DIR="ops/unico-preview/source"
STAGE="${1:-}"

case "$STAGE" in
  prepare)
    test -n "${HOSTINGER_API_TOKEN:-}"
    node - <<'NODE'
const fs=require("fs");
const r=JSON.parse(fs.readFileSync("ops/unico-preview/source/RELEASE.json","utf8"));
if(r.sourceSha!=="000ef9ce9e3d28b2b473faf8ef6db17e150b3364")throw new Error("source_sha_mismatch");
if(r.publicHost!=="unico-preview.apidevelopers.digital")throw new Error("target_mismatch");
if(r.productionHost!=="unico.apidevelopers.digital")throw new Error("production_mismatch");
if(r.secretsIncluded!==false||r.productionMutation!==false)throw new Error("unsafe_release");
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
      echo "NODE_ARCHIVE=$NODE_ARCHIVE"
      echo "NODE_ARCHIVE_NAME=$NODE_ARCHIVE_NAME"
      echo "CARRIER=$CARRIER"
      echo "HOSTINGER_USERNAME=$HOSTINGER_USERNAME"
      echo "HOSTINGER_DOMAIN=$HOSTINGER_DOMAIN"
    } >> "$GITHUB_ENV"
    ;;
  install-mcp)
    MCP_WORKDIR="$RUNNER_TEMP/hostinger-mcp-1.26.0-$GITHUB_RUN_ID"
    rm -rf "$MCP_WORKDIR"; mkdir -p "$MCP_WORKDIR"
    cp ops/unico-preview/deploy-carrier-mcp.mjs "$MCP_WORKDIR/client.mjs"
    (cd "$MCP_WORKDIR" && npm init -y >/dev/null && npm install --no-audit --no-fund hostinger-api-mcp@1.26.0 @modelcontextprotocol/sdk@1.10.0)
    {
      echo "HOSTINGER_MCP_BIN=$MCP_WORKDIR/node_modules/.bin/hostinger-hosting-mcp"
      echo "CARRIER_CLIENT=$MCP_WORKDIR/client.mjs"
    } >> "$GITHUB_ENV"
    ;;
  carrier)
    node "$CARRIER_CLIENT" "$CARRIER"
    ;;
  verify-archive)
    node - <<'NODE'
const url=`https://${process.env.HOSTINGER_DOMAIN}/${process.env.NODE_ARCHIVE_NAME}`;
const r=await fetch(url,{redirect:"follow"});
if(!r.ok)throw new Error(`hosted_archive_http_${r.status}`);
const b=Buffer.from(await r.arrayBuffer());
if(b.length<100)throw new Error("hosted_archive_too_small");
console.log(JSON.stringify({hostedArchive:true,status:r.status,bytes:b.length}));
NODE
    ;;
  node-build)
    node apps/site-factory/src/run-hostinger-node-build-api-only.mjs \
      --mode apply --username "$HOSTINGER_USERNAME" --domain "$HOSTINGER_DOMAIN" \
      --archive "$NODE_ARCHIVE" --transport documented-json-filename \
      --archive-representation-verified true --node-version 22 --app-type express \
      --output-directory "" --build-script "" --entry-file server.mjs \
      --package-manager npm --expected-text "uni.co" \
      --evidence "$RUNNER_TEMP/unico-preview-node-evidence.json"
    ;;
  health)
    node - <<'NODE'
const url="https://unico-preview.apidevelopers.digital/health";let last=null;
for(let i=0;i<24;i++){try{const r=await fetch(url,{redirect:"follow"});const text=await r.text();last={status:r.status,text};if(r.ok){const b=JSON.parse(text);if(b?.ok===true&&b?.product==="uni-co-web"){console.log("preview_health_ok=true");process.exit(0);}}}catch(e){last={error:e.message}}await new Promise(x=>setTimeout(x,5000));}
console.error(JSON.stringify(last));process.exit(1);
NODE
    ;;
  *) echo "unsupported_stage:$STAGE" >&2; exit 2 ;;
esac
