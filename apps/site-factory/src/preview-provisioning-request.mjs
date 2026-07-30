import crypto from "node:crypto";

const required = (name, value) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
};

const blocked = (name, value) => {
  if (value !== false) throw new Error(`${name}_must_be_false`);
};

const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
};

export function createPreviewProvisioningRequest({
  promotionPlan,
  readinessReport,
  hostingContext,
  buildCommand,
  outputDirectory,
  applicationName,
  requestedAt = new Date().toISOString(),
}) {
  if (promotionPlan?.mode !== "dry-run") {
    throw new Error("promotion_plan_must_be_dry_run");
  }
  if (readinessReport?.mode !== "external-readiness-dry-run") {
    throw new Error("readiness_report_must_be_external_dry_run");
  }

  for (const [name, value] of [
    ["promotion_writes_enabled", promotionPlan.writesEnabled],
    ["promotion_deploy_enabled", promotionPlan.deployEnabled],
    ["promotion_dns_enabled", promotionPlan.dnsEnabled],
    ["readiness_writes_enabled", readinessReport.writesEnabled],
    ["readiness_deploy_enabled", readinessReport.deployEnabled],
    ["readiness_dns_enabled", readinessReport.dnsEnabled],
  ]) blocked(name, value);

  const domain = required("promotionPlan.target.domain", promotionPlan.target?.domain).toLowerCase();
  const readinessDomain = required(
    "readinessReport.target.domain",
    readinessReport.target?.domain,
  ).toLowerCase();
  if (domain !== readinessDomain) throw new Error("preview_domain_mismatch");

  if (readinessReport.hosting?.websiteExists === true) {
    throw new Error("preview_web_app_already_exists");
  }
  if (!readinessReport.blockers?.includes("preview_web_app_not_found")) {
    throw new Error("preview_creation_not_justified_by_readiness");
  }

  const action = readinessReport.requiredActions?.find(
    (item) => item?.action === "create_preview_web_app",
  );
  if (
    !action ||
    action.sensitive !== true ||
    action.approvalRequired !== true ||
    action.executable !== false
  ) {
    throw new Error("preview_creation_action_must_be_blocked");
  }

  const sha = required("promotionPlan.source.sha", promotionPlan.source?.sha);
  if (sha !== required("readinessReport.source.sha", readinessReport.source?.sha)) {
    throw new Error("source_sha_mismatch");
  }

  if (hostingContext?.provider !== "hostinger") {
    throw new Error("unsupported_hosting_provider");
  }
  if (hostingContext.previewDnsRecordExists === true) {
    throw new Error("preview_dns_record_already_exists");
  }

  const request = {
    schemaVersion: "1.0",
    kind: "preview-web-app-provisioning-request",
    mode: "supervised-request",
    executable: false,
    approvalRequired: true,
    approvalScope: "create-isolated-preview-web-app-only",
    requestedAt,
    application: {
      name: required("applicationName", applicationName),
      runtime: required("promotionPlan.runtime", promotionPlan.runtime),
      buildCommand: required("buildCommand", buildCommand),
      outputDirectory: required("outputDirectory", outputDirectory),
    },
    source: {
      repository: required("promotionPlan.source.repository", promotionPlan.source?.repository),
      sha,
      artifactName: required(
        "promotionPlan.source.artifactName",
        promotionPlan.source?.artifactName,
      ),
    },
    target: {
      environment: "preview",
      domain,
      healthcheck: required(
        "promotionPlan.target.healthcheck",
        promotionPlan.target?.healthcheck,
      ),
      hosting: {
        provider: "hostinger",
        orderId: required("hostingContext.orderId", String(hostingContext.orderId ?? "")),
        username: required("hostingContext.username", hostingContext.username),
        plan: required("hostingContext.plan", hostingContext.plan),
        inventoryCapturedAt: required(
          "hostingContext.inventoryCapturedAt",
          hostingContext.inventoryCapturedAt,
        ),
        websitesInspected: Number(hostingContext.websitesInspected ?? 0),
      },
    },
    evidence: {
      promotionFingerprint: required(
        "promotionPlan.fingerprint",
        promotionPlan.fingerprint,
      ),
      readinessFingerprint: required(
        "readinessReport.fingerprint",
        readinessReport.fingerprint,
      ),
      blocker: "preview_web_app_not_found",
    },
    invariants: {
      preservePrimaryDomain: true,
      preserveCurrentWordPress: true,
      overwriteDns: false,
      wildcardDns: false,
      deployOnCreation: false,
      productionWrites: false,
    },
    requestedAction: {
      action: "create_preview_web_app",
      sensitive: true,
      approvalRequired: true,
      executable: false,
      createsHostingResource: true,
      connectsRepository: false,
      configuresDns: false,
      deploysArtifact: false,
    },
    deferredActions: [
      "connect_exact_source_commit",
      "configure_preview_domain",
      "deploy_preview_artifact",
      "validate_ssl_and_healthcheck",
      "register_preview_release",
      "prove_rollback_by_commit",
    ],
  };

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");

  return freeze({
    ...request,
    fingerprint,
    approvalToken:
      `IGOR_APROVA_CRIACAO_WEBAPP_PREVIEW_${fingerprint.slice(0, 12).toUpperCase()}`,
  });
}
