const SOURCE = "uni.operator.hostinger.direct.v1";

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeDomain(value) {
  return requireString(value, "domain")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/\.$/, "");
}

function collection(value, label) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.data)) return value.data;
  throw new TypeError(`${label} must be an array or an object with a data array`);
}

function domainFromInstallation(installation) {
  for (const candidate of [
    installation?.domain,
    installation?.url,
    installation?.site_url,
    installation?.home_url,
  ]) {
    if (typeof candidate !== "string" || candidate.trim() === "") continue;
    try {
      return normalizeDomain(new URL(candidate).hostname);
    } catch {
      return normalizeDomain(candidate);
    }
  }
  return null;
}

function isRootInstallation(installation) {
  const directory = String(installation?.directory ?? installation?.path ?? "").trim();
  return directory === "" || directory === "/";
}

function freeze(value) {
  return Object.freeze(value);
}

export const UNI_OPERATOR_HOSTINGER_SOURCE = SOURCE;

export function createUniOperatorHostingerSnapshot({
  domain,
  websitesResponse,
  wordpressInstallationsResponse,
  capturedAt = new Date().toISOString(),
}) {
  const normalizedDomain = normalizeDomain(domain);
  const websites = collection(websitesResponse, "websitesResponse");
  const installations = collection(
    wordpressInstallationsResponse,
    "wordpressInstallationsResponse",
  );

  const website = websites.find((item) => {
    const candidate = item?.domain ?? item?.fqdn;
    return typeof candidate === "string" && normalizeDomain(candidate) === normalizedDomain;
  });

  const installation = installations.find(
    (item) => domainFromInstallation(item) === normalizedDomain,
  );

  const enabled = website
    ? Boolean(website.is_enabled ?? website.enabled ?? website.state === "active")
    : false;
  const valid = installation
    ? Boolean(installation.is_valid ?? installation.valid ?? false)
    : false;

  return freeze({
    schemaVersion: 1,
    source: SOURCE,
    mode: "read-only",
    capturedAt: requireString(capturedAt, "capturedAt"),
    domain: normalizedDomain,
    capabilities: freeze({
      hostingInventory: true,
      wordpressInventory: true,
      wordpressAuthentication: false,
      writes: false,
    }),
    website: freeze({
      found: Boolean(website),
      enabled,
      vhostType: website?.vhost_type ?? website?.type ?? null,
      documentRootKind:
        typeof website?.root_directory === "string" &&
        website.root_directory.replace(/\/+$/, "").endsWith("/public_html")
          ? "public_html"
          : website
            ? "custom"
            : null,
    }),
    wordpress: freeze({
      found: Boolean(installation),
      valid,
      rootInstallation: installation ? isRootInstallation(installation) : false,
      baseUrl: installation ? `https://${normalizedDomain}` : null,
      locale: installation?.language ?? installation?.locale ?? null,
      version: installation?.version ?? installation?.core_version ?? null,
    }),
    safety: freeze({
      secretsIncluded: false,
      internalIdentifiersIncluded: false,
      personalDataIncluded: false,
    }),
  });
}

export function assertUniOperatorHostingerSnapshot(snapshot) {
  requireObject(snapshot, "snapshot");

  if (snapshot.schemaVersion !== 1) {
    throw new TypeError("snapshot.schemaVersion must be 1");
  }
  if (snapshot.source !== SOURCE) {
    throw new TypeError(`snapshot.source must be ${SOURCE}`);
  }
  if (snapshot.mode !== "read-only") {
    throw new TypeError("snapshot.mode must be read-only");
  }

  const normalizedDomain = normalizeDomain(snapshot.domain);
  const capabilities = requireObject(snapshot.capabilities, "snapshot.capabilities");
  const safety = requireObject(snapshot.safety, "snapshot.safety");

  if (capabilities.writes !== false) {
    throw new TypeError("snapshot.capabilities.writes must be false");
  }
  if (
    safety.secretsIncluded !== false ||
    safety.internalIdentifiersIncluded !== false ||
    safety.personalDataIncluded !== false
  ) {
    throw new TypeError("snapshot safety flags must all be false");
  }

  return normalizedDomain;
}

export function createPlannerHostingerInventory(snapshot) {
  const normalizedDomain = assertUniOperatorHostingerSnapshot(snapshot);
  const website = requireObject(snapshot.website, "snapshot.website");
  const wordpress = requireObject(snapshot.wordpress, "snapshot.wordpress");

  return freeze({
    domain: normalizedDomain,
    found: Boolean(website.found || wordpress.found),
    wordpressReady: Boolean(wordpress.found && wordpress.valid),
    websites: freeze(
      website.found
        ? [
            freeze({
              enabled: Boolean(website.enabled),
              state: website.enabled ? "active" : "inactive",
              type: website.vhostType ?? null,
              domains: freeze([normalizedDomain]),
            }),
          ]
        : [],
    ),
    wordpressInstallations: freeze(
      wordpress.found
        ? [
            freeze({
              domain: normalizedDomain,
              path: wordpress.rootInstallation ? "" : null,
              version: wordpress.version ?? null,
              language: wordpress.locale ?? null,
              title: null,
              valid: Boolean(wordpress.valid),
            }),
          ]
        : [],
    ),
  });
}
