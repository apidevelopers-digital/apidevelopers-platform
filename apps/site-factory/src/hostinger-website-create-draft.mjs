import crypto from "node:crypto";

const CREATE_WEBSITE_ENDPOINT = "/api/hosting/v1/websites";
const REQUIRED_PREFLIGHT_KIND =
  "hostinger-business-hosting-preview-preflight";
const DEFAULT_MAX_PREFLIGHT_AGE_MS = 6 * 60 * 60 * 1000;

function requiredString(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }

  return value.trim();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function validateDomain(value) {
  const domain = requiredString("domain", value);

  if (domain !== domain.toLowerCase()) {
    throw new Error("domain_must_be_lowercase");
  }

  if (
    domain.startsWith("www.") ||
    domain.startsWith("*.") ||
    domain.includes("://") ||
    domain.includes("/") ||
    domain.includes(":") ||
    domain.endsWith(".") ||
    domain.length > 253
  ) {
    throw new Error("invalid_preview_domain");
  }

  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length < 1 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    throw new Error("invalid_preview_domain");
  }

  return domain;
}

function assertReadOnlyPreflight(report, generatedAt, maxPreflightAgeMs) {
  if (!report || typeof report !== "object") {
    throw new Error("preflight_report_missing");
  }

  if (
    report.kind !== REQUIRED_PREFLIGHT_KIND ||
    report.product !== "business-web-hosting" ||
    report.mode !== "read-only" ||
    report.executable !== false ||
    report.writesEnabled !== false ||
    report.provisioningEnabled !== false ||
    report.dnsEnabled !== false ||
    report.deployEnabled !== false ||
    report.readyForProvisioningApproval !== true
  ) {
    throw new Error("preflight_report_must_be_read_only_and_ready");
  }

  if (
    !Array.isArray(report.datacenters) ||
    report.datacenters.length === 0
  ) {
    throw new Error("preflight_datacenters_unavailable");
  }

  const checkedAtMs = Date.parse(requiredString("preflightReport.checkedAt", report.checkedAt));
  const generatedAtMs = Date.parse(requiredString("generatedAt", generatedAt));

  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(generatedAtMs)) {
    throw new Error("invalid_preflight_or_generation_timestamp");
  }

  const ageMs = generatedAtMs - checkedAtMs;
  if (ageMs < -5 * 60 * 1000 || ageMs > maxPreflightAgeMs) {
    throw new Error("preflight_report_stale_or_from_future");
  }
}

function assertOrderReference(orderId, orderReference) {
  const reference = requiredString(
    "preflightReport.orderReference",
    orderReference,
  );
  const suffixMatch = /^order-\*{3,}([0-9]{4})$/.exec(reference);

  if (!suffixMatch || !orderId.endsWith(suffixMatch[1])) {
    throw new Error("order_reference_mismatch");
  }
}

export function createHostingerWebsiteCreateDraft({
  domain,
  expectedDomain,
  orderId,
  datacenterCode,
  preflightReport,
  sourceRepository,
  sourceSha,
  generatedAt = new Date().toISOString(),
  maxPreflightAgeMs = DEFAULT_MAX_PREFLIGHT_AGE_MS,
}) {
  assertReadOnlyPreflight(preflightReport, generatedAt, maxPreflightAgeMs);

  const normalizedDomain = validateDomain(domain);
  const normalizedExpectedDomain = validateDomain(expectedDomain);

  if (normalizedDomain !== normalizedExpectedDomain) {
    throw new Error("preview_domain_mismatch");
  }

  const normalizedOrderId = requiredString("orderId", String(orderId ?? ""));
  if (!/^[0-9]+$/.test(normalizedOrderId)) {
    throw new Error("invalid_order_id");
  }

  assertOrderReference(normalizedOrderId, preflightReport.orderReference);

  const normalizedDatacenterCode = requiredString(
    "datacenterCode",
    datacenterCode,
  );
  const selectedDatacenter = preflightReport.datacenters.find(
    (item) => item?.code === normalizedDatacenterCode,
  );

  if (!selectedDatacenter) {
    throw new Error("datacenter_code_not_present_in_preflight");
  }

  const normalizedSourceRepository = requiredString(
    "sourceRepository",
    sourceRepository,
  );
  const normalizedSourceSha = requiredString("sourceSha", sourceSha);

  if (!/^[a-f0-9]{40}$/.test(normalizedSourceSha)) {
    throw new Error("invalid_source_sha");
  }

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
    generatedAt,
    provider: "hostinger",
    product: "business-web-hosting",
    source: {
      repository: normalizedSourceRepository,
      sha: normalizedSourceSha,
    },
    request: {
      method: "POST",
      endpoint: CREATE_WEBSITE_ENDPOINT,
      execute: false,
      payload: {
        domain: normalizedDomain,
        order_id: normalizedOrderId,
        datacenter_code: normalizedDatacenterCode,
      },
    },
    selectedDatacenter: {
      code: normalizedDatacenterCode,
      title:
        typeof selectedDatacenter.title === "string"
          ? selectedDatacenter.title
          : null,
      coordinates:
        selectedDatacenter.coordinates &&
        typeof selectedDatacenter.coordinates === "object"
          ? {
              latitude: Number(selectedDatacenter.coordinates.latitude),
              longitude: Number(selectedDatacenter.coordinates.longitude),
            }
          : null,
    },
    evidence: {
      preflightKind: preflightReport.kind,
      preflightFingerprint: requiredString(
        "preflightReport.fingerprint",
        preflightReport.fingerprint,
      ),
      orderReference: preflightReport.orderReference,
      checkedAt: requiredString(
        "preflightReport.checkedAt",
        preflightReport.checkedAt,
      ),
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
    deferredActions: [
      "execute_create_website_post",
      "inspect_created_website_by_api",
      "upload_exact_sha_archive",
      "start_node_static_build",
      "configure_preview_dns",
      "validate_ssl_and_healthcheck",
      "register_preview_release",
      "prove_rollback_by_commit",
    ],
  };

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(draft))
    .digest("hex");

  return deepFreeze({
    ...draft,
    fingerprint,
    approvalToken:
      `IGOR_APROVA_CRIACAO_WEBSITE_PREVIEW_${fingerprint
        .slice(0, 12)
        .toUpperCase()}`,
  });
}
