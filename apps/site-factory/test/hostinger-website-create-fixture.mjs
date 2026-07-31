
import crypto from "node:crypto";

export const repository =
  "apidevelopers-digital/apidevelopers-platform";
export const sourceSha =
  "1b775697244245f1b6bb79801244c0a67f5c286a";
export const domain =
  "preview-apidevelopers.apidevelopers.digital";
export const now = new Date("2026-07-31T03:50:00.000Z");

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function makeDraft() {
  const draft = {
    schemaVersion: "1.0",
    kind: "hostinger-business-hosting-website-create-draft",
    mode: "approval-draft",
    executable: false,
    approvalRequired: true,
    approvalScope: "create-isolated-preview-website-only",
    writesEnabled: false,
    provisioningEnabled: false,
    dnsEnabled: false,
    deployEnabled: false,
    generatedAt: "2026-07-31T03:25:55.256Z",
    provider: "hostinger",
    product: "business-web-hosting",
    source: { repository, sha: sourceSha },
    request: {
      method: "POST",
      endpoint: "/api/hosting/v1/websites",
      execute: false,
      payload: {
        domain,
        order_id: "1009450581",
        datacenter_code: "ascenty",
      },
    },
    selectedDatacenter: {
      code: "ascenty",
      title: "South America (Brazil)",
    },
    evidence: {
      preflightKind: "hostinger-business-hosting-preview-preflight",
      preflightFingerprint: "preflight",
      orderReference: "order-****0581",
      checkedAt: "2026-07-31T03:19:06.136Z",
    },
    invariants: {
      preservePrimaryDomain: true,
      preserveCurrentWordPress: true,
      createOnlyIsolatedPreviewWebsite: true,
      connectRepository: false,
      configureDns: false,
      uploadArchive: false,
      startNodeBuild: false,
      deployArtifact: false,
      productionWrites: false,
    },
    deferredActions: ["execute_create_website_post"],
  };
  const fingerprint = digest(draft);
  return {
    ...draft,
    fingerprint,
    approvalToken:
      `IGOR_APROVA_CRIACAO_WEBSITE_PREVIEW_${fingerprint
        .slice(0, 12)
        .toUpperCase()}`,
  };
}

export function makeApproval(draft) {
  const body = {
    schemaVersion: "1.0",
    kind: "hostinger-business-hosting-website-create-approval",
    status: "approved",
    singleUse: true,
    consumed: false,
    scope: "create-isolated-preview-website-only",
    approvedBy: "Igor",
    approvedAt: "2026-07-31T03:41:00.000Z",
    expiresAt: "2026-07-31T09:41:00.000Z",
    source: { repository },
    approvedFingerprint: draft.fingerprint,
    approvalTokenDigest: crypto
      .createHash("sha256")
      .update(draft.approvalToken)
      .digest("hex"),
    constraints: {
      domain,
      orderReference: "order-****0581",
      datacenterCode: "ascenty",
      connectRepository: false,
      configureDns: false,
      uploadArchive: false,
      startNodeBuild: false,
      deployArtifact: false,
      productionWrites: false,
      wordpressChanges: false,
    },
  };
  return { ...body, fingerprint: digest(body) };
}

export function json(value, status = 200) {
  return Response.json(value, { status });
}
