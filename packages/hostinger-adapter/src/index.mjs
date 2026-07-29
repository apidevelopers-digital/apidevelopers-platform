const DEFAULT_BASE_URL = "https://developers.hostinger.com";

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeBaseUrl(value) {
  return requireNonEmptyString(value, "baseUrl").replace(/\/+$/, "");
}

function normalizeDomain(value) {
  return requireNonEmptyString(value, "domain")
    .toLowerCase()
    .replace(/\.$/, "");
}

function appendQuery(path, entries) {
  const url = new URL(path, "https://adapter.invalid");
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

function extractCollection(payload) {
  if (Array.isArray(payload)) {
    return Object.freeze({ data: payload, meta: null });
  }

  if (payload && typeof payload === "object" && Array.isArray(payload.data)) {
    return Object.freeze({
      data: payload.data,
      meta:
        payload.meta && typeof payload.meta === "object" ? payload.meta : null,
    });
  }

  throw new HostingerAdapterError(
    "Hostinger response did not contain a collection",
    { code: "invalid_collection_response" },
  );
}

function websiteDomains(website) {
  const values = new Set();

  if (typeof website?.domain === "string") {
    values.add(normalizeDomain(website.domain));
  }
  if (typeof website?.fqdn === "string") {
    values.add(normalizeDomain(website.fqdn));
  }

  if (Array.isArray(website?.domains)) {
    for (const entry of website.domains) {
      if (typeof entry === "string") {
        values.add(normalizeDomain(entry));
      }
      if (typeof entry?.fqdn === "string") {
        values.add(normalizeDomain(entry.fqdn));
      }
      if (typeof entry?.domain === "string") {
        values.add(normalizeDomain(entry.domain));
      }
    }
  }

  if (typeof website?.preview_domain?.fqdn === "string") {
    values.add(normalizeDomain(website.preview_domain.fqdn));
  }

  return [...values];
}

function installationDomain(installation) {
  for (const candidate of [
    installation?.domain,
    installation?.site_url,
    installation?.url,
    installation?.home_url,
  ]) {
    if (typeof candidate !== "string" || candidate.trim() === "") continue;
    try {
      return normalizeDomain(new URL(candidate).hostname);
    } catch {
      return normalizeDomain(
        candidate.replace(/^https?:\/\//, "").split("/")[0],
      );
    }
  }
  return null;
}

function sanitizeWebsite(website) {
  return Object.freeze({
    uid: website?.uid ?? website?.id ?? null,
    username: website?.username ?? website?.user?.username ?? null,
    enabled:
      website?.is_enabled ??
      website?.enabled ??
      website?.state === "active",
    state: website?.state ?? null,
    type: website?.type ?? website?.vhost_type ?? null,
    flavor: website?.flavor ?? null,
    domains: Object.freeze(websiteDomains(website)),
    wordpress: website?.wordpress
      ? Object.freeze({
          domain: website.wordpress.domain ?? null,
          title: website.wordpress.title ?? website.wordpress.site_title ?? null,
          language:
            website.wordpress.language ?? website.wordpress.locale ?? null,
          createdAt:
            website.wordpress.created_at ??
            website.wordpress.createdAt ??
            null,
        })
      : null,
  });
}

function sanitizeInstallation(installation) {
  return Object.freeze({
    id: installation?.id ?? installation?.software ?? null,
    username:
      installation?.username ?? installation?.account_username ?? null,
    domain: installationDomain(installation),
    path: installation?.path ?? installation?.directory ?? null,
    version:
      installation?.version ?? installation?.core_version ?? null,
    language: installation?.language ?? installation?.locale ?? null,
    title: installation?.title ?? installation?.site_title ?? null,
    valid: installation?.valid ?? installation?.is_valid ?? null,
    validationError:
      installation?.validationError ??
      installation?.validation_error ??
      installation?.validation_error_message ??
      null,
  });
}

function optionalPositiveInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export class HostingerAdapterError extends Error {
  constructor(
    message,
    {
      code = "hostinger_error",
      status = null,
      correlationId = null,
      cause,
    } = {},
  ) {
    super(message, { cause });
    this.name = "HostingerAdapterError";
    this.code = code;
    this.status = status;
    this.correlationId = correlationId;
  }
}

export class HostingerReadOnlyAdapter {
  #baseUrl;
  #token;
  #fetch;
  #timeoutMs;

  constructor({
    baseUrl = DEFAULT_BASE_URL,
    token,
    fetchImpl = globalThis.fetch,
    timeoutMs = 15_000,
  } = {}) {
    this.#baseUrl = normalizeBaseUrl(baseUrl);
    this.#token = requireNonEmptyString(token, "token");

    if (typeof fetchImpl !== "function") {
      throw new TypeError(FfetchImpl must be a function`);
    }
    this.#fetch = fetchImpl;

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError(FtimeoutMs must be a positive integer`);
    }
    this.#timeoutMs = timeoutMs;
  }

  async #get(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.#token}`,
        },
        signal: controller.signal,
      });

      const correlationId =
        response.headers?.get?.("x-correlation-id") ??
        response.headers?.get?.("correlation-id") ??
        null;

      let payload = null;
      const raw = await response.text();
      if (raw !== "") {
        try {
          payload = JSON.parse(raw);
        } catch (cause) {
          throw new HostingerAdapterError(
            "Hostinger returned invalid JSON",
            {
              code: "invalid_json",
              status: response.status,
              correlationId,
              cause,
            },
          );
        }
      }

      if (!response.ok) {
        const message =
          payload?.error?.message ??
          payload?.message ??
          payload?.error ??
          `Hostinger request failed with status ${response.status}`;

        throw new HostingerAdapterError(String(message), {
          code: "http_error",
          status: response.status,
          correlationId: payload?.correlation_id ?? correlationId,
        });
      }

      return payload;
    } catch (cause) {
      if (cause instanceof HostingerAdapterError) throw cause;
      if (cause?.name === "AbortError") {
        throw new HostingerAdapterError("Hostinger request timed out", {
          code: "timeout",
          cause,
        });
      }
      throw new HostingerAdapterError("Hostinger request failed", {
        code: "network_error",
        cause,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async listWebsites({
    page = 1,
    perPage = 50,
    username,
    orderId,
    isEnabled,
    domain,
  } = {}) {
    const payload = await this.#get(
      appendQuery("/api/hosting/v1/websites", {
        page,
        per_page: perPage,
        username,
        order_id: orderId,
        is_enabled: isEnabled,
        domain,
      }),
    );
    const collection = extractCollection(payload);
    return Object.freeze({
      data: Object.freeze(collection.data.map(sanitizeWebsite)),
      meta: collection.meta,
    });
  }

  async listWordPressInstallations({
    username,
    domain,
    ownership,
  } = {}) {
    const payload = await this.#get(
      appendQuery("/api/hosting/v1/wordpress/installations", {
        username,
        domain,
        ownership,
      }),
    );
    const collection = extractCollection(payload);
    return Object.freeze({
      data: Object.freeze(collection.data.map(sanitizeInstallation)),
      meta: collection.meta,
    });
  }

  async getWordPressInstallationJwtToken({ username, software }) {
    const account = encodeURIComponent(
      requireNonEmptyString(username, "username"),
    );
    const installation = encodeURIComponent(
      requireNonEmptyString(software, "software"),
    );
    const payload = await this.#get(
      `/api/hosting/v1/accounts/${account}/wordpress/${installation}/jwt-token`,
    );

    const token =
      payload?.token ?? payload?.jwt ?? payload?.access_token;
    if (typeof token !== "string" || token.trim() === "") {
      throw new HostingerAdapterError(
        "Hostinger did not return a WordPress JWT token",
        { code: "missing_wordpress_jwt" },
      );
    }

    return Object.freeze({
      token,
      expiresIn: optionalPositiveInteger(payload?.expires_in),
      expiresAt:
        payload?.expires_at ?? payload?.expiration ?? null,
      mcpUrl:
        payload?.mcp_url ??
        payload?.endpoint ??
        payload?.mcp_endpoint ??
        null,
    });
  }

  async inventoryDomain(domain) {
    const normalized = normalizeDomain(domain);
    const [websites, installations] = await Promise.all([
      this.listWebsites({ domain: normalized }),
      this.listWordPressInstallations({ domain: normalized }),
    ]);

    const matchingWebsites = websites.data.filter((website) =>
      website.domains.includes(normalized),
    );
    const matchingInstallations = installations.data.filter(
      (installation) => installation.domain === normalized,
    );

    return Object.freeze({
      domain: normalized,
      websites: Object.freeze(matchingWebsites),
      wordpressInstallations: Object.freeze(matchingInstallations),
      found:
        matchingWebsites.length > 0 ||
        matchingInstallations.length > 0,
      wordpressReady: matchingInstallations.some(
        (installation) => installation.valid !== false,
      ),
    });
  }
}

export function createHostingerReadOnlyAdapter(options) {
  return new HostingerReadOnlyAdapter(options);
}
