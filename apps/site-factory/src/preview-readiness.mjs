import crypto from "node:crypto";

function normalizeWebsites(snapshot) {
  if (Array.isArray(snapshot)) return snapshot;
  if (snapshot && Array.isArray(snapshot.data)) return snapshot.data;
  if (snapshot && Array.isArray(snapshot.websites)) return snapshot.websites;
  return [];
}

function websiteDomain(website) {
  return String(
    website?.domain ??
    website?.name ??
    website?.hostname ??
    "",
  ).trim().toLowerCase();
}

export function createPreviewReadinessReport({
  promotionPlan,
  hostingSnapshot,
  checkedAt = new Date().toISOString(),
}) {
  if (!promotionPlan || promotionPlan.mode !== "dry-run") {
    throw new Error("promotion_plan_must_be_dry_run");
  }

  if (
    promotionPlan.deployEnabled !== false ||
    promotionPlan.dnsEnabled !== false ||
    promotionPlan.writesEnabled !== false
  ) {
    throw new Error("promotion_plan_must_block_external_writes");
  }

  const targetDomain = String(promotionPlan.target?.domain ?? "")
    .trim()
    .toLowerCase();

  if (!targetDomain) {
    throw new Error("preview_target_domain_missing");
  }

  const websites = normalizeWebsites(hostingSnapshot);
  const matchedWebsite = websites.find(
    (website) => websiteDomain(website) === targetDomain,
  );

  const websiteExists = Boolean(matchedWebsite);
  const websiteEnabled =
    matchedWebsite?.is_enabled === true ||
    matchedWebsite?.enabled === true ||
    matchedWebsite?.status === "active";

  const blockers = [];
  const requiredActions = [];

  if (!websiteExists) {
    blockers.push("preview_web_app_not_found");
    requiredActions.push({
      action: "create_preview_web_app",
      sensitive: true,
      approvalRequired: true,
      executable: false,
    });
  } else if (!websiteEnabled) {
    blockers.push("preview_web_app_not_enabled");
    requiredActions.push({
      action: "enable_preview_web_app",
      sensitive: true,
      approvalRequired: true,
      executable: false,
    });
  }

  requiredActions.push({
    action: "connect_exact_source_commit",
    sourceSha: promotionPlan.source?.sha,
    sensitive: true,
    approvalRequired: true,
    executable: false,
  });

  requiredActions.push({
    action: "run_preview_healthcheck_after_deploy",
    path: promotionPlan.target?.healthcheck,
    sensitive: false,
    approvalRequired: false,
    executable: false,
  });

  const report = {
    schemaVersion: "1.0",
    mode: "external-readiness-dry-run",
    readyForApply: false,
    writesEnabled: false,
    deployEnabled: false,
    dnsEnabled: false,
    approvalRequired: true,
    checkedAt,
    source: promotionPlan.source,
    target: promotionPlan.target,
    hosting: {
      provider: promotionPlan.hosting,
      snapshotReceived: hostingSnapshot !== undefined,
      websitesInspected: websites.length,
      websiteExists,
      websiteEnabled,
      matchedWebsite: matchedWebsite
        ? {
            domain: websiteDomain(matchedWebsite),
            status:
              matchedWebsite.status ??
              (websiteEnabled ? "active" : "unknown"),
          }
        : null,
    },
    blockers,
    requiredActions,
    readyForSupervisedPreview:
      websiteExists && websiteEnabled && blockers.length === 0,
  };

  return Object.freeze({
    ...report,
    fingerprint: crypto
      .createHash("sha256")
      .update(JSON.stringify(report))
      .digest("hex"),
  });
}
