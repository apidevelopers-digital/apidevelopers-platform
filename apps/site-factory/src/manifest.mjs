import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  return requireString(value, "site.domain").toLowerCase().replace(/\.$/, "");
}

function normalizeBaseUrl(value) {
  const parsed = new URL(requireString(value, "wordpress.baseUrl"));
  if (parsed.protocol !== "https:") {
    throw new TypeError("wordpress.baseUrl must use HTTPS");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.href.replace(/\/$/, "");
}

function normalizeSlug(value, label) {
  const slug = requireString(value, label)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") throw new TypeError(`${label} must produce a valid slug`);
  return slug;
}

export function validateSiteManifest(input) {
  const manifest = requireObject(input, "manifest");

  if (manifest.schemaVersion !== 1) {
    throw new TypeError("schemaVersion must be 1");
  }

  const site = requireObject(manifest.site, "site");
  const hostinger = requireObject(manifest.hostinger, "hostinger");
  const wordpress = requireObject(manifest.wordpress, "wordpress");

  if (site.engine !== "wordpress") {
    throw new TypeError("site.engine must be wordpress in this foundation increment");
  }

  if (!Array.isArray(wordpress.pages) || wordpress.pages.length === 0) {
    throw new TypeError("wordpress.pages must contain at least one page");
  }

  const slugs = new Set();
  const pages = wordpress.pages.map((page, index) => {
    requireObject(page, `wordpress.pages[${index}]`);
    const slug = normalizeSlug(
      page.slug ?? page.title,
      `wordpress.pages[${index}].slug`,
    );
    if (slugs.has(slug)) {
      throw new TypeError(`duplicate page slug: ${slug}`);
    }
    slugs.add(slug);

    const status = page.status ?? "draft";
    if (status !== "draft") {
      throw new TypeError(
        `wordpress.pages[${index}].status must be draft in the foundation increment`,
      );
    }

    return Object.freeze({
      slug,
      title: requireString(page.title, `wordpress.pages[${index}].title`),
      status,
      content: typeof page.content === "string" ? page.content : "",
      template: page.template ?? null,
      menuOrder: Number.isInteger(page.menuOrder) ? page.menuOrder : index,
    });
  });

  const domain = normalizeDomain(site.domain);
  const baseUrl = normalizeBaseUrl(wordpress.baseUrl);
  if (new URL(baseUrl).hostname.toLowerCase() !== domain) {
    throw new TypeError("wordpress.baseUrl hostname must match site.domain");
  }

  return Object.freeze({
    schemaVersion: 1,
    site: Object.freeze({
      id: requireString(site.id, "site.id"),
      domain,
      engine: "wordpress",
      locale: requireString(site.locale ?? "pt-BR", "site.locale"),
      maintenance: site.maintenance !== false,
    }),
    hostinger: Object.freeze({
      domain: normalizeDomain(hostinger.domain ?? domain),
    }),
    wordpress: Object.freeze({
      baseUrl,
      pages: Object.freeze(pages),
    }),
  });
}

export async function loadSiteManifest(path) {
  const resolvedPath = resolve(path);
  const raw = await readFile(resolvedPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new TypeError(`manifest is not valid JSON: ${cause.message}`);
  }

  return Object.freeze({
    path: resolvedPath,
    manifest: validateSiteManifest(parsed),
  });
}
