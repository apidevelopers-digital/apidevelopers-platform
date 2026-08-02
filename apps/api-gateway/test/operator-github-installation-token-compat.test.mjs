import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createGitHubReadonlyClient } from "../src/operator-github-readonly-client.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY_ROOT = path.resolve(HERE, "..");

function syntheticInstallationToken(length = 520) {
  const prefix = "ghs_";
  const alphabet = "App1234567890._-";
  const bodyLength = length - prefix.length;
  return prefix + alphabet.repeat(Math.ceil(bodyLength / alphabet.length)).slice(0, bodyLength);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function provider(bytes) {
  return {
    async withSecret(_access, consumer) {
      return consumer({
        bytes,
        version: "synthetic-stateless-installation-token-v1",
      });
    },
  };
}

test("GitHub readonly client accepts an opaque 520-byte installation token without truncation or leakage", async () => {
  const token = syntheticInstallationToken();
  const tokenBytes = Buffer.from(token, "utf8");
  const tokenHash = sha256(tokenBytes);
  let transportObservation;

  assert.equal(token.startsWith("ghs_"), true);
  assert.equal(tokenBytes.byteLength, 520);

  const client = createGitHubReadonlyClient({
    secretProvider: provider(tokenBytes),
    credentialRef: "vault://github/operator-readonly-installation-token",
    transport: {
      async requestWithCredential(input) {
        transportObservation = {
          scheme: input.credential.scheme,
          byteLength: input.credential.bytes.byteLength,
          credentialHash: sha256(input.credential.bytes),
          method: input.request.method,
          hasAuthorizationHeader: Object.keys(input.request.headers).some(
            (name) => name.toLowerCase() === "authorization",
          ),
        };

        return {
          status: 200,
          body: {
            login: "apidevelopers-digital",
            token: "must-not-be-returned",
          },
        };
      },
    },
  });

  const result = await client.getOrganization({
    organization: "apidevelopers-digital",
    correlationId: "corr_stateless_token_001",
    tenantId: "uni.",
  });

  assert.deepEqual(transportObservation, {
    scheme: "bearer",
    byteLength: 520,
    credentialHash: tokenHash,
    method: "GET",
    hasAuthorizationHeader: false,
  });
  assert.deepEqual(result, { login: "apidevelopers-digital" });
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(tokenBytes.byteLength, 520);
  assert.equal(sha256(tokenBytes), tokenHash);
});

test("gateway source does not encode fixed GitHub installation-token length assumptions", () => {
  const roots = [
    path.join(GATEWAY_ROOT, "src"),
    path.join(GATEWAY_ROOT, "scripts"),
    path.join(GATEwAY_ROOT, "staging"),
  ];
  const findings = [];

  function visit(entry) {
    const stat = fs.statSync(entry);
    if (stat.isDirectory()) {
      for (const name of fs.readDirSync(entry)) visit(path.join(entry, name));
      return;
    }

    if (!/\.(?:mjs|js|json|ya?ml)$/i.test(entry)) return;

    const lines = fs.readFileSync(entry, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const credentialContext = /token|credential|secret|authorization/i.test(line);
      const fixedLengthMechanism =
        /(?:length|byteLength|slice|substring|substr|varchar|char|regex|regexp|\{\*\d+\s*(?:\,s\*\d+\s*)?\})/i.test(
          line,
        );
      const legacyBound = /\b(?:D0|255)\b/.test(line);

      if (credentialContext && fixedLengthMechanism && legacyBound) {
        findings.push(
          ${path.relative(GATEWAY_ROOT, entry)}:${index + 1}:${line.trim()}`,
        );
      }
    });
  }

  roots.forEach(visit);
  assert.deepEqual(findings, []);
});
