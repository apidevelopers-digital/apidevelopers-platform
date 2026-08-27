import { constants, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { appendFileSync } from "node:fs";

const gateway = process.env.GATEWAY;
const organizationId = process.env.ORGANIZATION_ID;
const adminKey = process.env.API_GATEWAY_ADMIN_KEY;
const privateKeyPem = process.env.TRUST_INSTITUTIONAL_PRIVATE_KEY_PEM;
const path = "/v1/trust/evaluation/operator/institutional-enrollment";

async function request(endpoint, { method = "GET", body } = {}) {
  const response = await fetch(`${gateway}${endpoint}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": adminKey,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`non-json response from ${endpoint}`);
  }
  if (!response.ok) {
    throw new Error(`${endpoint} failed with HTTP ${response.status}: ${payload.reason ?? "unknown"}`);
  }
  return payload;
}

const before = await request(path);
if (before?.institution?.organizationId !== organizationId) {
  throw new Error("unexpected institutional organizationId");
}
if (before?.enrollment?.enrollmentPresent === true) {
  console.log(JSON.stringify({
    organizationId,
    enrollmentPresent: true,
    status: String(before.enrollment.status ?? ""),
    recipientKeyFingerprint: String(before.enrollment.recipientKeyFingerprint ?? ""),
    keyPossessionVerified: before.enrollment.keyPossessionVerified === true,
    created: false,
  }));
  process.exit(0);
}

const privateKey = createPrivateKey(privateKeyPem);
if (
  privateKey.asymmetricKeyType !== "rsa" ||
  Number(privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
) {
  throw new Error("institutional RSA key must be at least 2048 bits");
}
const recipientPublicKey = createPublicKey(privateKey)
  .export({ type: "spki", format: "pem" })
  .toString();

const challengeResponse = await request(`${path}/challenge`, {
  method: "POST",
  body: {
    recipientPublicKey,
    correlationId: `trust-preview-face-${Date.now()}`,
  },
});
if (challengeResponse.organizationId !== organizationId) {
  throw new Error("challenge organization mismatch");
}
const challenge = challengeResponse.challenge;
if (!challenge?.challengeId || !challenge?.signingPayloadB64u) {
  throw new Error("challenge response is incomplete");
}

const signature = sign(
  "sha256",
  Buffer.from(challenge.signingPayloadB64u, "base64url"),
  {
    key: privateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  },
);

const proofResponse = await request(`${path}/proof`, {
  method: "POST",
  body: {
    challengeId: challenge.challengeId,
    recipientPublicKey,
    signatureB64u: signature.toString("base64url"),
  },
});
if (proofResponse?.proof?.keyPossessionVerified !== true) {
  throw new Error("key possession proof was not verified");
}
const approvedAt = String(proofResponse?.proof?.verifiedAt ?? "");
if (!approvedAt || Number.isNaN(Date.parse(approvedAt))) {
  throw new Error("proof verifiedAt is unavailable");
}

const enrollmentResponse = await request(path, {
  method: "POST",
  body: {
    recipientPublicKey,
    keyProofChallengeId: challenge.challengeId,
    institutionalApproval: {
      decision: "approved",
      assertion: "organization_and_recipient_authorized",
      reference: "trust-preview-face-institutional-enrollment-2026-08-27",
      authority: "API Developers.digital",
      approvedBy: "igor",
      approvedAt,
      subjectOrganizationId: organizationId,
    },
  },
});
if (
  enrollmentResponse?.enrollment?.status !== "approved" ||
  enrollmentResponse?.organizationId !== organizationId
) {
  throw new Error("institutional enrollment was not approved");
}

const after = await request(path);
const safe = {
  organizationId,
  enrollmentPresent: after?.enrollment?.enrollmentPresent === true,
  status: String(after?.enrollment?.status ?? ""),
  recipientKeyFingerprint: String(after?.enrollment?.recipientKeyFingerprint ?? ""),
  keyPossessionVerified: after?.enrollment?.keyPossessionVerified === true,
  identityVerifiedByThisService: after?.enrollment?.identityVerifiedByThisService === true,
  secretsIncluded: after?.secretsIncluded === true,
  privateKeyIncluded: after?.privateKeyIncluded === true,
  created: enrollmentResponse?.enrollment?.created === true,
};
if (
  !safe.enrollmentPresent ||
  safe.status !== "approved" ||
  !safe.keyPossessionVerified ||
  safe.secretsIncluded ||
  safe.privateKeyIncluded
) {
  throw new Error("post-enrollment readiness verification failed");
}

console.log(JSON.stringify(safe));
appendFileSync(
  process.env.GITHUB_STEP_SUMMARY,
  [
    "### Trust institutional enrollment",
    "",
    `- organizationId: ${safe.organizationId}`,
    `- enrollmentPresent: ${safe.enrollmentPresent}`,
    `- status: ${safe.status}`,
    `- recipientKeyFingerprint: ${safe.recipientKeyFingerprint}`,
    `- keyPossessionVerified: ${safe.keyPossessionVerified}`,
    `- privateKeyIncluded: ${safe.privateKeyIncluded}`,
    "",
  ].join("\n"),
);
