import fs from "node:fs";
import { constants as cryptoConstants, createPublicKey, verify } from "node:crypto";

const port = Number(process.env.PORT);
const keyId = process.env.KEY_ID;
const publicKey = createPublicKey(fs.readFileSync(process.env.PUBLIC_KEY, "utf8"));
const issuedAt = new Date();
const expiresAt = new Date(issuedAt.getTime() + 60_000);

const request = {
  version: "zuni-remote-signer/v1",
  operation: "sign-zuni-delegated-binding",
  keyId,
  algorithm: "RSA-PSS-SHA256",
  audience: "unico-api-platform:zuni-documents",
  payload: {
    version: "zuni-delegated-binding/v1",
    audience: "unico-api-platform:zuni-documents",
    tenantId: "tenant.local-e2e",
    workspaceId: "workspace.local-e2e",
    accessGrantId: "grant.local-e2e",
    productId: "zuni",
    principalId: "principal.local-e2e",
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    nonce: `nonce-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`,
  },
  timeoutMs: 1800,
};

const response = await fetch(`http://127.0.0.1:${port}/v1/sign`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request),
});
if (response.status !== 200) throw new Error(`remote_signer_e2e_http_${response.status}`);

const signed = await response.json();
if (signed.keyId !== keyId || signed.algorithm !== "RSA-PSS-SHA256") {
  throw new Error("remote_signer_e2e_response_contract_mismatch");
}
const [payloadB64u, signatureB64u] = String(signed.proof ?? "").split(".");
if (!payloadB64u || !signatureB64u) throw new Error("remote_signer_e2e_invalid_proof");

const ok = verify(
  "sha256",
  Buffer.from(payloadB64u, "utf8"),
  { key: publicKey, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
  Buffer.from(signatureB64u, "base64url"),
);
if (!ok) throw new Error("remote_signer_e2e_signature_verification_failed");

process.stdout.write(JSON.stringify({
  mode: "local-e2e-reversible",
  keyId: signed.keyId,
  algorithm: signed.algorithm,
  host: "127.0.0.1",
  port,
  signatureVerified: true,
  productionActivated: false,
  isolatedTemporaryKeychain: true,
}) + "\n");
