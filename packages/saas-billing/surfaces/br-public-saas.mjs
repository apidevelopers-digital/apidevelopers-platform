const STATUSES = new Set(["published", "planned"]);

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

function normalizeHttpsUrl(value, name) {
  const url = new URL(requireText(value, name));
  if (url.protocol !== "https:") {
    throw new TypeError(`${name} must use https`);
  }
  return url;
}

function createSurface(input = {}) {
  const surfaceId = requireText(input.surfaceId, "surfaceId").toLowerCase();
  const productId = requireText(input.productId, "productId").toLowerCase();
  const status = requireText(input.status, "status").toLowerCase();
  if (!STATUSES.has(status)) throw new TypeError("status must be published or planned");

  const originUrl = normalizeHttpsUrl(input.origin, "origin");
  const publicUrl = normalizeHttpsUrl(input.publicUrl, "publicUrl");
  if (publicUrl.origin !== originUrl.origin) {
    throw new TypeError("publicUrl origin must match origin");
  }

  return Object.freeze({
    surfaceId,
    productId,
    origin: originUrl.origin,
    publicUrl: publicUrl.toString(),
    status,
    checkoutEnabled: false,
  });
}

const surfaces = [
  {
    surfaceId: "sitedauni-imuni",
    productId: "imuni",
    origin: "https://sitedauni.com",
    publicUrl: "https://sitedauni.com/apps/imuni/",
    status: "published",
  },
  {
    surfaceId: "sitedauni-uni-juri",
    productId: "uni.juri",
    origin: "https://sitedauni.com",
    publicUrl: "https://sitedauni.com/apps/juri/",
    status: "published",
  },
  {
    surfaceId: "sitedauni-uni-verso",
    productId: "uni.verso",
    origin: "https://sitedauni.com",
    publicUrl: "https://sitedauni.com/apps/universo/",
    status: "published",
  },
  {
    surfaceId: "sitedauni-uni-co",
    productId: "uni.co",
    origin: "https://sitedauni.com",
    publicUrl: "https://sitedauni.com/apps/unico/",
    status: "published",
  },
  {
    surfaceId: "zuni-web",
    productId: "zuni",
    origin: "https://zuni.sitedauni.com",
    publicUrl: "https://zuni.sitedauni.com/",
    status: "published",
  },
  {
    surfaceId: "sitedauni-uni-social",
    productId: "uni.social",
    origin: "https://sitedauni.com",
    publicUrl: "https://sitedauni.com/apps/uni-social/",
    status: "planned",
  },
].map(createSurface);

const byId = new Map(surfaces.map((surface) => [surface.surfaceId, surface]));

export const BR_PUBLIC_SAAS_SURFACES = Object.freeze([...surfaces]);

export const BR_PUBLIC_SAAS_SURFACE_REGISTRY = Object.freeze({
  get(surfaceId) {
    const key = requireText(surfaceId, "surfaceId").toLowerCase();
    const surface = byId.get(key);
    if (!surface) throw new Error("unknown billing surface");
    return surface;
  },
  list() {
    return BR_PUBLIC_SAAS_SURFACES;
  },
  published() {
    return Object.freeze(surfaces.filter((surface) => surface.status === "published"));
  },
});
