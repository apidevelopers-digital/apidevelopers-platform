function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeBaseUrl(value) {
  const parsed = new URL(requireNonEmptyString(value, "baseUrl"));
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new TypeError("baseUrl must use HTTP or HTTPS");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.href.replace(/\/$/, "");
}

function normalizeSlug(value) {
  return requireNonEmptyString(value, "slug")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function pageTitle(page) {
  if (typeof page?.title === "string") return page.title;
  return page?.title?.raw ?? page?.title?.rendered ?? "";
}

function pageContent(page) {
  if (typeof page?.content === "string") return page.content;
  return page?.content?.raw ?? page?.content?.rendered ?? "";
}

function createAuthHeader(auth) {
  if (!auth) return null;

  if (auth.type === "bearer") {
    return `Bearer ${requireNonEmptyString(auth.token, "auth.token")}`;
  }

  if (auth.type === "application-password") {
    const username = requireNonEmptyString(auth.username, "auth.username");
    const password = requireNonEmptyString(
      auth.applicationPassword,
      "auth.applicationPassword",
    );
    return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  }

  throw new TypeError("auth.type must be bearer or application-password");
}

function validateDesiredPage(page, index) {
  if (!page || typeof page !== "object" || Array.isArray(page)) {
    throw new TypeError(`pages[${index}] must be an object`);
  }

  const slug = normalizeSlug(page.slug ?? page.title);
  const title = requireNonEmptyString(page.title, `pages[${index}].title`);
  const status = page.status ?? "draft";

  if (!["draft", "pending", "private", "publish"].includes(status)) {
    throw new TypeError(`pages[${index}].status is not supported`);
  }

  return Object.freeze({
    slug,
    title,
    status,
    content: normalizeText(page.content),
    template: page.template ?? null,
    menuOrder: Number.isInteger(page.menuOrder) ? page.menuOrder : 0,
  });
}

export class WordPressAdapterError extends Error {
  constructor(message, { code = "wordpress_error", status = null, cause } = {}) {
    super(message, { cause });
    this.name = "WordPressAdapterError";
    this.code = code;
    this.status = status;
  }
}

export class WordPressReadOnlyAdapter {
  #baseUrl;
  #authHeader;
  #fetch;
  #timeoutMs;

  constructor({
    baseUrl,
    auth = null,
    fetchImpl = globalThis.fetch,
    timeoutMs = 15_000,
  } = {}) {
    this.#baseUrl = normalizeBaseUrl(baseUrl);
    this.#authHeader = createAuthHeader(auth);

    if (typeof fetchImpl !== "function") {
      throw new TypeError("fetchImpl must be a function");
    }
    this.#fetch = fetchImpl;

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("timeoutMs must be a positive integer");
    }
    this.#timeoutMs = timeoutMs;
  }

  get hasAuthentication() {
    return this.#authHeader !== null;
  }

  async #get(path, { authenticated = false } = {}) {
    if (authenticated && !this.#authHeader) {
      throw new WordPressAdapterError("WordPress authentication is not configured", {
        code: "authentication_not_configured",
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    const headers = { accept: "application/json" };
    if (authenticated) headers.authorization = this.#authHeader;

    try {
      const response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      const raw = await response.text();
      let payload = null;
      if (raw !== "") {
        try {
          payload = JSON.parse(raw);
        } catch (cause) {
          throw new WordPressAdapterError("WordPress returned invalid JSON", {
            code: "invalid_json",
            status: response.status,
            cause,
          });
        }
      }

      if (!response.ok) {
        throw new WordPressAdapterError(
          String(payload?.message ?? `WordPress request failed with status ${response.status}`),
          {
            code: payload?.code ?? "http_error",
            status: response.status,
          },
        );
      }

      return Object.freeze({
        payload,
        total: Number(response.headers?.get?.("x-wp-total") ?? 0),
        totalPages: Number(response.headers?.get?.("x-wp-totalpages") ?? 0),
      });
    } catch (cause) {
      if (cause instanceof WordPressAdapterError) throw cause;
      if (cause?.name === "AbortError") {
        throw new WordPressAdapterError("WordPress request timed out", {
          code: "timeout",
          cause,
        });
      }
      throw new WordPressAdapterError("WordPress request failed", {
        code: "network_error",
        cause,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async discover() {
    const { payload } = await this.#get("/wp-json/");
    const namespaces = Array.isArray(payload?.namespaces) ? payload.namespaces : [];
    const routes = payload?.routes && typeof payload.routes === "object" ? payload.routes : {};

    return Object.freeze({
      name: payload?.name ?? null,
      description: payload?.description ?? null,
      url: payload?.url ?? this.#baseUrl,
      home: payload?.home ?? this.#baseUrl,
      namespaces: Object.freeze([...namespaces]),
      hasWpV2: namespaces.includes("wp/v2") || Boolean(routes["/wp/v2"]),
      hasPagesRoute: Boolean(routes["/wp/v2/pages"]),
      authenticationSchemes: Object.freeze(
        payload?.authentication && typeof payload.authentication === "object"
          ? Object.keys(payload.authentication)
          : [],
      ),
    });
  }

  async validateAuthentication() {
    const { payload } = await this.#get(
      "/wp-json/wp/v2/users/me?context=edit&_fields=id,slug,name,roles,capabilities",
      { authenticated: true },
    );

    return Object.freeze({
      validated: true,
      user: Object.freeze({
        id: payload?.id ?? null,
        slug: payload?.slug ?? null,
        name: payload?.name ?? null,
        roles: Object.freeze(Array.isArray(payload?.roles) ? payload.roles : []),
        canEditPages: Boolean(
          payload?.capabilities?.edit_pages ??
            payload?.capabilities?.edit_others_pages ??
            payload?.capabilities?.manage_options,
        ),
        canPublishPages: Boolean(
          payload?.capabilities?.publish_pages ??
            payload?.capabilities?.manage_options,
        ),
      }),
    });
  }

  async listPages() {
    const fields = [
      "id",
      "slug",
      "status",
      "title",
      "content",
      "template",
      "menu_order",
      "modified_gmt",
      "link",
    ].join(",");
    const { payload, total, totalPages } = await this.#get(
      `/wp-json/wp/v2/pages?context=edit&per_page=100&orderby=id&order=asc&_fields=${encodeURIComponent(fields)}`,
      { authenticated: true },
    );

    if (!Array.isArray(payload)) {
      throw new WordPressAdapterError("WordPress pages response was not a collection", {
        code: "invalid_pages_response",
      });
    }

    return Object.freeze({
      data: Object.freeze(
        payload.map((page) =>
          Object.freeze({
            id: page.id,
            slug: page.slug,
            status: page.status,
            title: pageTitle(page),
            content: pageContent(page),
            template: page.template ?? null,
            menuOrder: page.menu_order ?? 0,
            modifiedGmt: page.modified_gmt ?? null,
            link: page.link ?? null,
          }),
        ),
      ),
      total,
      totalPages,
    });
  }

  planPages(desiredPages, existingPages) {
    if (!Array.isArray(desiredPages)) {
      throw new TypeError("desiredPages must be an array");
    }
    if (!Array.isArray(existingPages)) {
      throw new TypeError("existingPages must be an array");
    }

    const desired = desiredPages.map(validateDesiredPage);
    const desiredSlugs = new Set();
    for (const page of desired) {
      if (desiredSlugs.has(page.slug)) {
        throw new TypeError(`duplicate desired page slug: ${page.slug}`);
      }
      desiredSlugs.add(page.slug);
    }

    const currentBySlug = new Map(
      existingPages
        .filter((page) => typeof page?.slug === "string")
        .map((page) => [normalizeSlug(page.slug), page]),
    );

    const operations = desired.map((target) => {
      const current = currentBySlug.get(target.slug);
      if (!current) {
        return Object.freeze({
          action: "create",
          slug: target.slug,
          target,
          current: null,
          reasons: Object.freeze(["missing_page"]),
        });
      }

      const reasons = [];
      if (normalizeText(pageTitle(current)) !== target.title) reasons.push("title_changed");
      if ((current.status ?? "draft") !== target.status) reasons.push("status_changed");
      if (normalizeText(pageContent(current)) !== target.content) reasons.push("content_changed");
      if ((current.template ?? null) !== target.template) reasons.push("template_changed");
      if ((current.menuOrder ?? current.menu_order ?? 0) !== target.menuOrder) {
        reasons.push("menu_order_changed");
      }

      return Object.freeze({
        action: reasons.length === 0 ? "noop" : "update",
        slug: target.slug,
        target,
        current: Object.freeze({
          id: current.id ?? null,
          slug: current.slug,
          title: pageTitle(current),
          status: current.status ?? null,
          template: current.template ?? null,
          menuOrder: current.menuOrder ?? current.menu_order ?? 0,
          link: current.link ?? null,
        }),
        reasons: Object.freeze(reasons),
      });
    });

    return Object.freeze({
      mode: "dry-run",
      writesEnabled: false,
      operations: Object.freeze(operations),
      totals: Object.freeze({
        create: operations.filter((item) => item.action === "create").length,
        update: operations.filter((item) => item.action === "update").length,
        noop: operations.filter((item) => item.action === "noop").length,
      }),
    });
  }
}

export function createWordPressReadOnlyAdapter(options) {
  return new WordPressReadOnlyAdapter(options);
}
