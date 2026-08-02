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
  const token = syntheticInstallationToken(520);
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
    tenantId: "uni.operator",
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

test("GitHub credential path remains opaque and has no legacy 40/255-character constraint", () => {
  const clientSource = fs.readFileSync(
    path.join(GATEWAY_ROOT, "src", "operator-github-readonly-client.mjs"),
    "utf8",
  );
  const secretContractSource = fs.readFileSync(
    path.join(GATEWAY_ROOT, "src", "operator-secret-provider-contract.mjs"),
    "utf8",
  );
  const credentialPathSource = `${clientSource}\n${secretContractSource}`;

  const forbiddenLegacyAssumptions = [
    /\.length\s*===\s*40\b/,
    /\.byteLength\s*===\s*40\b/,
    /\.slice\(\s*0\s*,\s*40\s*\)/,
    /\.substring\(\s*0\s*,\s*40\s*\)/,
    /\bVARCHAR\s*\(\s*(?:40|255)\s*\)/i,
    /\bCHAR\s*\(\s*(?:40|255)\s*\)/i,
    /\bmaxLength\s*:\s*(?:40|255)\b/i,
    /\bghs_[A-Za-z0-9_]{36}\b/,
  ];

  for (const pattern of forbiddenLegacyAssumptions) {
    assert.equal(
      pattern.test(credentialPathSource),
      false,
      `legacy GitHub installation-token assumption detected: ${pattern}`,
    );
  }

  const maxSecretBytesMatch = secretContractSource.match(
    /const\s+MAX_SECRET_BYTES\s*=\s*(\d+)\s*;/,
  );
  assert.ok(maxSecretBytesMatch, "MAX_SECRET_BYTES guard must remain explicit");
  assert.ok(
    Number(maxSecretBytesMatch[1]) >= 520,
    "secret contract must accept installation tokens of at least 520 bytes",
  );
  assert.equal(clientSource.includes("ghs_"), false);
  assert.match(clientSource, /bytes:\s*lease\.bytes/);
});
