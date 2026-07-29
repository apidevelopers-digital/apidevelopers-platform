function freezeArray(value = []) {
  return Object.freeze([...value]);
}

function inventorySummary(inventory) {
  if (!inventory) {
    return Object.freeze({
      verified: false,
      found: null,
      wordpressReady: null,
      websites: Object.freeze([]),
      installations: Object.freeze([]),
    });
  }

  return Object.freeze({
    verified: true,
    found: inventory.found,
    wordpressReady: inventory.wordpressReady,
    websites: freezeArray(inventory.websites),
    installations: freezeArray(inventory.wordpressInstallations),
  });
}

function authSummary(authentication) {
  if (!authentication) {
    return Object.freeze({
      validated: false,
      user: null,
    });
  }

  return Object.freeze({
    validated: Boolean(authentication.validated),
    user: authentication.user
      ? Object.freeze({
          id: authentication.user.id,
          slug: authentication.user.slug,
          name: authentication.user.name,
          roles: freezeArray(authentication.user.roles),
          canEditPages: Boolean(authentication.user.canEditPages),
          canPublishPages: Boolean(authentication.user.canPublishPages),
        })
      : null,
  });
}

export function createSiteFactoryDryRun({
  manifest,
  hostingerInventory = null,
  wordpressDiscovery,
  wordpressAuthentication = null,
  pagePlan = null,
  generatedAt = new Date().toISOString(),
}) {
  const blockers = [];

  if (!hostingerInventory) {
    blockers.push("hostinger_inventory_not_verified");
  } else if (!hostingerInventory.found) {
    blockers.push("hostinger_domain_not_found");
  } else if (!hostingerInventory.wordpressReady) {
    blockers.push("hostinger_wordpress_not_ready");
  }

  if (!wordpressDiscovery?.hasWpV2) {
    blockers.push("wordpress_wp_v2_not_discovered");
  }
  if (!wordpressDiscovery?.hasPagesRoute) {
    blockers.push("wordpress_pages_route_not_discovered");
  }

  if (!wordpressAuthentication?.validated) {
    blockers.push("wordpress_authentication_not_validated");
  } else if (!wordpressAuthentication.user?.canEditPages) {
    blockers.push("wordpress_user_cannot_edit_pages");
  }

  if (!pagePlan) {
    blockers.push("wordpress_page_inventory_not_loaded");
  }

  return Object.freeze({
    schemaVersion: 1,
    mode: "dry-run",
    generatedAt,
    site: manifest.site,
    safety: Object.freeze({
      writesEnabled: false,
      publishEnabled: false,
      deleteEnabled: false,
      dnsChangesEnabled: false,
      secretsIncluded: false,
    }),
    hostinger: inventorySummary(hostingerInventory),
    wordpress: Object.freeze({
      discovery: wordpressDiscovery,
      authentication: authSummary(wordpressAuthentication),
      pages: pagePlan,
    }),
    blockers: freezeArray(blockers),
    readyForApply: false,
    nextGate:
      blockers.length === 0
        ? "explicit_write_scope_and_approval_required"
        : "resolve_dry_run_blockers",
  });
}
