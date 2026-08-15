import crypto from "node:crypto";

const CREATE = "/api/agency-hosting/v1/orders/{order_id}/websites/setups";
const STATUS = "/api/agency-hosting/v1/orders/{order_id}/websites/setups/{setup_uuid}";
const PREFLIGHT_KIND = "hostinger-business-hosting-preview-preflight";

function req(name, value) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_or_invalid:${name}`);
  return value.trim();
}

function domain(value) {
  const v = req("domain", value);
  if (v !== v.toLowerCase() || v.includes("://") || v.includes("/") || v.includes(":") || v.startsWith("*.") || v.startsWith("www.")) {
    throw new Error("invalid_target_domain");
  }
  const labels = v.split(".");
  if (labels.length < 2 || labels.some((x) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x))) {
    throw new Error("invalid_target_domain");
  }
  return v;
}

function assertPreflight(report, dc) {
  if (!report || report.kind !== PREFLIGHT_KIND || report.mode !== "read-only" ||
      report.executable !== false || report.writesEnabled !== false ||
      report.provisioningEnabled !== false || report.dnsEnabled !== false ||
      report.deployEnabled !== false || report.readyForProvisioningApproval !== true) {
    throw new Error("preflight_report_not_safe");
  }
  if (!Array.isArray(report.datacenters) || !report.datacenters.some((x) => x?.code === dc)) {
    throw new Error("datacenter_not_in_preflight");
  }
  req("preflight.fingerprint", report.fingerprint);
  req("preflight.checkedAt", report.checkedAt);
  req("preflight.orderReference", report.orderReference);
}

export function createHostingerAgencyWebsiteCreateDraftV2({
  domain: requestedDomain,
  expectedDomain,
  orderId,
  datacenterCode,
  preflightReport,
  sourceRepository,
  sourceSha,
  phpVersion = "8.3",
  generatedAt = new Date().toISOString(),
}) {
  const target = domain(requestedDomain);
  if (target !== domain(expectedDomain)) throw new Error("target_domain_mismatch");

  const order = req("orderId", String(orderId ?? ""));
  if (!/^[0-9]+$/.test(order)) throw new Error("invalid_order_id");
  const dc = req("datacenterCode", datacenterCode);
  assertPreflight(preflightReport, dc);

  const repo = req("sourceRepository", sourceRepository);
  const sha = req("sourceSha", sourceSha);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("invalid_source_sha");

  const draft = {
    schemaVersion: "2.0",
    kind: "hostinger-agency-website-create-draft-v2",
    mode: "approval-draft",
    executable: false,
    approvalRequired: true,
    approvalScope: "create-agency-website-only",
    writesEnabled: false,
    provisioningEnabled: false,
    dnsEnabled: false,
    nodeBuildEnabled: false,
    deployEnabled: false,
    productionWrites: false,
    generatedAt: req("generatedAt", generatedAt),
    provider: "hostinger",
    apiContract: {
      create: { method: "POST", endpoint: CREATE, asynchronous: true, execute: false },
      status: { method: "GET", endpoint: STATUS, readOnly: true },
      terminalStatus: "completed",
      setupIdentifier: "setup_uuid",
      websiteIdentifier: "website_uid",
    },
    source: { repository: repo, sha },
    request: {
      order_id: order,
      payload: {
        datacenter_code: dc,
        flavor: "php-fpm",
        settings: { php: { version: req("phpVersion", phpVersion) } },
        domain: target,
      },
    },
    evidence: {
      preflightFingerprint: preflightReport.fingerprint,
      orderReference: preflightReport.orderReference,
      checkedAt: preflightReport.checkedAt,
    },
    invariants: {
      singleCreatePostAfterApproval: true,
      statusPollingIsReadOnly: true,
      configureDns: false,
      startNodeBuild: false,
      uploadArchive: false,
      deployArtifact: false,
    },
  };

  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(draft)).digest("hex");
  return Object.freeze({
    ...draft,
    fingerprint,
    approvalToken: `IGOR_APROVA_AGENCY_WEBSITE_CREATE_V2_${fingerprint.slice(0, 12).toUpperCase()}`,
  });
}

export const HOSTINGER_AGENCY_WEBSITE_CREATE_V2_CONTRACT = Object.freeze({
  createEndpoint: CREATE,
  statusEndpoint: STATUS,
  createMethod: "POST",
  statusMethod: "GET",
  asynchronous: true,
  setupIdentifier: "setup_uuid",
  websiteIdentifier: "website_uid",
});
