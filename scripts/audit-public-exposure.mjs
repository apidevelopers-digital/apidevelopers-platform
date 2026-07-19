import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const AUDIT_DIR = path.join(ROOT, ".audit");
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_GIT_BUFFER = 256 * 1024 * 1024;

const binaryExtensions = new Set([
  ".7z", ".avi", ".bin", ".bmp", ".class", ".dmg", ".doc", ".docx", ".eot",
  ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".mov", ".mp3", ".mp4",
  ".pdf", ".png", ".ppt", ".pptx", ".pyc", ".so", ".tar", ".tgz", ".tiff",
  ".ttf", ".wav", ".webm", ".webp", ".woff", ".woff2", ".xls", ".xlsx", ".zip",
]);

const scannerPaths = new Set([
  "scripts/audit-public-exposure.mjs",
  ".github/workflows/public-exposure-audit-ci.yml",
]);

const riskyFileRules = [
  ["private-key-file", /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|.*\.(pem|key|p12|pfx|jks|keystore))$/i],
  ["environment-file", /(^|\/)\.env($|\.)/i],
  ["credential-file", /(^|\/)(credentials?|secrets?|service[-_]?account|auth)\.(json|ya?ml|ini|conf|txt)$/i],
  ["package-auth-file", /(^|\/)(\.npmrc|\.netrc|\.pypirc)$/i],
];

const secretRules = [
  ["private-key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{20,255}\b/g],
  ["github-fine-grained-token", /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/g],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["openai-api-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["stripe-live-key", /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/g],
  ["slack-token", /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g],
  ["twilio-api-key", /\bSK[0-9a-fA-F]{32}\b/g],
  ["meta-access-token", /\bEAA[A-Za-z0-9]{30,}\b/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g],
  ["credentialed-url", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/@]+:[^@\s]+@[^\s"'`]+/gi],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*\b/g],
];

const currentTreeOnlyRules = [
  ["cpf", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "high"],
  ["cnpj", /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "high"],
  ["formatted-phone", /(?:\+55\s*)?\(\d{2}\)\s*\d{4,5}-\d{4}\b/g, "medium"],
  ["local-user-path", /\/Users\/[A-Za-z0-9._-]+\//g, "medium"],
  ["private-network-address", /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g, "medium"],
];

const workflowRules = [
  ["workflow-write-all", /\bpermissions\s*:\s*write-all\b/i, "high"],
  ["workflow-id-token-write", /\bid-token\s*:\s*write\b/i, "medium"],
  ["workflow-contents-write", /\bcontents\s*:\s*write\b/i, "medium"],
  ["workflow-secrets-inherit", /\bsecrets\s*:\s*inherit\b/i, "medium"],
  ["workflow-pull-request-target", /\bpull_request_target\s*:/i, "high"],
];

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: MAX_GIT_BUFFER,
    ...options,
  });
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return [
    "example", "dummy", "test", "fake", "sample", "placeholder", "redacted",
    "changeme", "change_me", "not_set", "not-set", "your_", "your-", "<token>",
    "${", "{{", "xxxxx", "000000",
  ].some((fragment) => normalized.includes(fragment));
}

const findings = [];
const findingKeys = new Set();

function addFinding({ severity, scope, rule, file = null, line = null, commit = null, value = "", detail = null }) {
  const key = [severity, scope, rule, file ?? "", line ?? "", commit ?? "", detail ?? ""].join("|");
  if (findingKeys.has(key)) return;
  findingKeys.add(key);
  findings.push({
    severity,
    scope,
    rule,
    file,
    line,
    commit,
    fingerprint: value ? fingerprint(value) : null,
    detail,
  });
}

function scanText(text, metadata, rules = secretRules) {
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      if (isPlaceholder(value)) continue;
      addFinding({
        severity: "high",
        ...metadata,
        rule,
        line: metadata.line ?? lineNumber(text, match.index ?? 0),
        value,
      });
    }
  }
}

const trackedFiles = git(["ls-files", "-z"]).split("\0").filter(Boolean);

for (const file of trackedFiles) {
  if (scannerPaths.has(file)) continue;

  for (const [rule, pattern] of riskyFileRules) {
    if (pattern.test(file)) {
      addFinding({ severity: "high", scope: "current-tree", rule, file, detail: "risky tracked filename" });
    }
  }

  const extension = path.extname(file).toLowerCase();
  if (binaryExtensions.has(extension)) continue;

  let buffer;
  try {
    buffer = await readFile(path.join(ROOT, file));
  } catch {
    addFinding({ severity: "medium", scope: "current-tree", rule: "unreadable-file", file });
    continue;
  }

  if (buffer.length > MAX_FILE_BYTES) {
    addFinding({ severity: "medium", scope: "current-tree", rule: "oversized-text-file", file, detail: `${buffer.length} bytes` });
    continue;
  }
  if (buffer.includes(0)) continue;

  const text = buffer.toString("utf8");
  scanText(text, { scope: "current-tree", file });

  for (const [rule, pattern, severity] of currentTreeOnlyRules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      if (isPlaceholder(value)) continue;
      addFinding({
        severity,
        scope: "current-tree",
        rule,
        file,
        line: lineNumber(text, match.index ?? 0),
        value,
      });
    }
  }

  if (file.startsWith(".github/workflows/")) {
    for (const [rule, pattern, severity] of workflowRules) {
      const match = pattern.exec(text);
      if (match) {
        addFinding({
          severity,
          scope: "workflow",
          rule,
          file,
          line: lineNumber(text, match.index),
          value: match[0],
        });
      }
    }
  }
}

const reviewPrefixes = [
  ["internal-operations-docs", "docs/operations/"],
  ["institutional-inventory-docs", "docs/inventory/"],
  ["internal-master-plan-docs", "docs/master-plan/"],
  ["internal-operating-model-docs", "docs/operating-model/"],
  ["messaging-integration-assets", "assets/ap-whatsapp/"],
];

for (const [rule, prefix] of reviewPrefixes) {
  const count = trackedFiles.filter((file) => file.startsWith(prefix)).length;
  if (count > 0) {
    addFinding({
      severity: "medium",
      scope: "public-review",
      rule,
      file: prefix,
      detail: `${count} tracked files require publication review`,
    });
  }
}

try {
  const historyNames = git(["log", "--all", "--name-only", "--pretty=format:@@COMMIT:%H"]);
  let currentCommit = null;
  for (const rawLine of historyNames.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("@@COMMIT:")) {
      currentCommit = line.slice("@@COMMIT:".length, "@@COMMIT:".length + 12);
      continue;
    }
    if (!line) continue;
    for (const [rule, pattern] of riskyFileRules) {
      if (pattern.test(line)) {
        addFinding({
          severity: "high",
          scope: "history-filename",
          rule,
          file: line,
          commit: currentCommit,
          detail: "risky filename exists in Git history",
        });
      }
    }
  }

  const historyPatch = git([
    "log", "--all", "-p", "--no-ext-diff", "--unified=0",
    "--pretty=format:@@COMMIT:%H", "--", ".",
  ]);
  currentCommit = null;
  let patchLine = 0;
  for (const rawLine of historyPatch.split("\n")) {
    patchLine += 1;
    if (rawLine.startsWith("@@COMMIT:")) {
      currentCommit = rawLine.slice("@@COMMIT:".length, "@@COMMIT:".length + 12);
      continue;
    }
    if ((!rawLine.startsWith("+") && !rawLine.startsWith("-")) || rawLine.startsWith("+++") || rawLine.startsWith("---")) continue;
    const text = rawLine.slice(1);
    scanText(text, {
      scope: "git-history",
      commit: currentCommit,
      line: patchLine,
    }, secretRules);
  }
} catch (error) {
  addFinding({
    severity: "high",
    scope: "git-history",
    rule: "history-scan-failed",
    detail: error instanceof Error ? error.message.slice(0, 240) : "unknown error",
  });
}

const counts = findings.reduce((result, finding) => {
  result[finding.severity] = (result[finding.severity] ?? 0) + 1;
  return result;
}, { high: 0, medium: 0, low: 0 });

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repository: process.env.GITHUB_REPOSITORY ?? "local",
  commit: process.env.GITHUB_SHA ?? git(["rev-parse", "HEAD"]).trim(),
  trackedFiles: trackedFiles.length,
  verdict: counts.high === 0 ? "NO_HIGH_CONFIDENCE_SECRET_DETECTED" : "BLOCK_PUBLICATION",
  publicSafeAutomatically: false,
  manualReviewRequired: true,
  counts,
  findings,
  constraints: {
    valuesRedacted: true,
    historyScanned: true,
    visibilityChanged: false,
  },
};

await mkdir(AUDIT_DIR, { recursive: true });
await writeFile(path.join(AUDIT_DIR, "public-exposure-report.json"), `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  "# Public exposure audit",
  "",
  `- Verdict: **${report.verdict}**`,
  `- Commit: \`${report.commit}\``,
  `- Tracked files: ${report.trackedFiles}`,
  `- High: ${counts.high}`,
  `- Medium: ${counts.medium}`,
  `- Values printed: no`,
  `- History scanned: yes`,
  `- Visibility changed: no`,
  "",
  "## Findings",
  "",
];

for (const finding of findings.slice(0, 200)) {
  const location = [
    finding.file ? `file=\`${finding.file}\`` : null,
    finding.line ? `line=${finding.line}` : null,
    finding.commit ? `commit=\`${finding.commit}\`` : null,
  ].filter(Boolean).join(", ");
  lines.push(`- **${finding.severity.toUpperCase()}** \`${finding.rule}\`${location ? ` — ${location}` : ""}${finding.detail ? ` — ${finding.detail}` : ""}`);
}
if (findings.length > 200) lines.push(`- ... ${findings.length - 200} additional findings omitted from summary`);

const markdown = `${lines.join("\n")}\n`;
await writeFile(path.join(AUDIT_DIR, "public-exposure-report.md"), markdown);

if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}

console.log(`public exposure audit: ${report.verdict}`);
console.log(`tracked files: ${trackedFiles.length}`);
console.log(`high findings: ${counts.high}`);
console.log(`medium findings: ${counts.medium}`);
for (const finding of findings.slice(0, 50)) {
  console.log([
    finding.severity.toUpperCase(),
    finding.rule,
    finding.file ?? "",
    finding.commit ?? "",
  ].filter(Boolean).join(" | "));
}

if (counts.high > 0) process.exit(1);
