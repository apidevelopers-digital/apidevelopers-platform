
export const ZUNI_REMOTE_SIGNER_LAUNCHD_LABEL =
  "digital.apidevelopers.zuni-remote-signer.test";

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function requiredAbsolutePath(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized.startsWith("/")) {
    throw new TypeError(`${name} must be an absolute path`);
  }
  return normalized;
}

export function renderZuniRemoteSignerTestLaunchdPlist({
  nodePath,
  entrypointPath,
  workingDirectory,
  keyId,
  port = 8765,
  stdoutPath,
  stderrPath,
} = {}) {
  const node = requiredAbsolutePath(nodePath, "nodePath");
  const entrypoint = requiredAbsolutePath(entrypointPath, "entrypointPath");
  const cwd = requiredAbsolutePath(workingDirectory, "workingDirectory");
  const out = requiredAbsolutePath(stdoutPath, "stdoutPath");
  const err = requiredAbsolutePath(stderrPath, "stderrPath");
  const normalizedKeyId = String(keyId ?? "").trim();
  if (!normalizedKeyId) throw new TypeError("keyId is required");

  const normalizedPort = Number(port);
  if (!Number.isSafeInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    throw new TypeError("port must be an integer between 1 and 65535");
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${ZUNI_REMOTE_SIGNER_LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(node)}</string>
    <string>${xmlEscape(entrypoint)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(cwd)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ZUNI_REMOTE_SIGNER_MODE</key>
    <string>test</string>
    <key>ZUNI_REMOTE_SIGNER_HOST</key>
    <string>127.0.0.1</string>
    <key>ZUNI_REMOTE_SIGNER_PORT</key>
    <string>${normalizedPort}</string>
    <key>ZUNI_REMOTE_SIGNER_KEY_ID</key>
    <string>${xmlEscape(normalizedKeyId)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(out)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(err)}</string>
</dict>
</plist>
`;
}
