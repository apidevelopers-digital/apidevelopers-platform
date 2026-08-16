#!/usr/bin/env bash
set -euo pipefail

test "${ZUNI_LOCAL_E2E_CONFIRMATION:-}" = "IGOR_APROVA_ZUNI_REMOTE_SIGNER_MAC_LOCAL_E2E_REVERSIVEL"

SERVICE="digital.apidevelopers.zuni-remote-signer"
ACCOUNT="delegated-binding-private-key"
LABEL="digital.apidevelopers.zuni-remote-signer.test"
KEY_ID="zuni-local-e2e-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
PORT="18765"
GUI_DOMAIN="gui/$(id -u)"
WORK_ROOT="$(mktemp -d "${RUNNER_TEMP:-/tmp}/zuni-remote-signer-e2e.XXXXXX")"
PRIVATE_KEY="$WORK_ROOT/private.pem"
PUBLIC_KEY="$WORK_ROOT/public.pem"
KEYCHAIN="$WORK_ROOT/zuni-e2e.keychain-db"
PLIST="$WORK_ROOT/${LABEL}.plist"
STDOUT_LOG="$WORK_ROOT/stdout.log"
STDERR_LOG="$WORK_ROOT/stderr.log"
KEYCHAIN_PASSWORD="$(/usr/bin/openssl rand -hex 32)"
KEYCHAIN_CREATED=0
SERVICE_BOOTSTRAPPED=0

cleanup() {
  set +e
  if [ "$SERVICE_BOOTSTRAPPED" -eq 1 ]; then
    /bin/launchctl bootout "$GUI_DOMAIN/$LABEL" >/dev/null 2>&1 || true
  fi
  if [ "$KEYCHAIN_CREATED" -eq 1 ]; then
    /usr/bin/security delete-generic-password -s "$SERVICE" -a "$ACCOUNT" "$KEYCHAIN" >/dev/null 2>&1 || true
    /usr/bin/security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  fi
  unset KEYCHAIN_PASSWORD
  rm -rf "$WORK_ROOT"
}
trap cleanup EXIT INT TERM

if /bin/launchctl print "$GUI_DOMAIN/$LABEL" >/dev/null 2>&1; then exit 21; fi
if /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then exit 22; fi

/usr/bin/openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$PRIVATE_KEY" >/dev/null 2>&1
/usr/bin/openssl pkey -in "$PRIVATE_KEY" -pubout -out "$PUBLIC_KEY" >/dev/null 2>&1
chmod 600 "$PRIVATE_KEY" "$PUBLIC_KEY"

/usr/bin/security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
KEYCHAIN_CREATED=1
/usr/bin/security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
/usr/bin/security set-keychain-settings -lut 1800 "$KEYCHAIN"
/usr/bin/security add-generic-password -s "$SERVICE" -a "$ACCOUNT" -w "$(cat "$PRIVATE_KEY")" "$KEYCHAIN" >/dev/null

export NODE_PATH="$(command -v node)"
export ENTRYPOINT="$(pwd)/scripts/start-zuni-remote-signer-macos-test.mjs"
export CWD="$(pwd)"
export KEY_ID PORT STDOUT_LOG STDERR_LOG KEYCHAIN

node --input-type=module > "$PLIST" <<'NODE'
import { renderZuniRemoteSignerTestLaunchdPlist } from "./src/saas-delegated-binding-remote-signer-launchd.mjs";
const req = (n) => { const v = process.env[n]; if (!v) throw new Error(`${n} is required`); return v; };
process.stdout.write(renderZuniRemoteSignerTestLaunchdPlist({
  nodePath: req("NODE_PATH"),
  entrypointPath: req("ENTRYPOINT"),
  workingDirectory: req("CWD"),
  keyId: req("KEY_ID"),
  port: Number(req("PORT")),
  stdoutPath: req("STDOUT_LOG"),
  stderrPath: req("STDERR_LOG"),
  keychainPath: req("KEYCHAIN"),
}));
NODE

/bin/launchctl bootstrap "$GUI_DOMAIN" "$PLIST"
SERVICE_BOOTSTRAPPED=1

ready=0
for _ in $(seq 1 30); do
  if /usr/bin/curl --silent --show-error --fail "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" -eq 1

export PUBLIC_KEY
node scripts/verify-zuni-remote-signer-macos-local-e2e.mjs

/bin/launchctl bootout "$GUI_DOMAIN/$LABEL"
SERVICE_BOOTSTRAPPED=0
/usr/bin/security delete-generic-password -s "$SERVICE" -a "$ACCOUNT" "$KEYCHAIN" >/dev/null
/usr/bin/security delete-keychain "$KEYCHAIN"
KEYCHAIN_CREATED=0
unset KEYCHAIN_PASSWORD
rm -rf "$WORK_ROOT"
trap - EXIT INT TERM

if /bin/launchctl print "$GUI_DOMAIN/$LABEL" >/dev/null 2>&1; then exit 31; fi
echo "Cleanup verified: isolated temporary keychain and launchd service removed."
