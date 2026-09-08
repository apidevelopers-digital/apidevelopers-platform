import { createMitraPublicResearchFacade } from "./mitra-public-research.mjs";
import {
  createMitraPublicCamaraFetchAdapter,
} from "./mitra-public-camara-upstream.mjs";

function numericEnv(env, name, fallback) {
  const raw = String(env?.[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function createMitraPublicOperationalWrapper({
  app,
  env = process.env,
  facadeFactory = createMitraPublicResearchFacade,
  camaraAdapterFactory = createMitraPublicCamaraFetchAdapter,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (typeof facadeFactory !== "function") {
    throw new TypeError("facadeFactory must be a function");
  }
  if (typeof camaraAdapterFactory !== "function") {
    throw new TypeError("camaraAdapterFactory must be a function");
  }

  const explicitUpstreamBaseUrl = String(
    env.MITRA_PUBLIC_RESEARCH_UPSTREAM_BASE_URL ?? "",
  ).trim();

  let provider = "external_https";
  let upstreamBaseUrl = explicitUpstreamBaseUrl;
  let upstreamBearer = env.MITRA_PUBLIC_RESEARCH_UPSTREAM_BEARER;
  let researchFetch = fetchImpl;

  if (!explicitUpstreamBaseUrl) {
    const camara = camaraAdapterFactory({
      fetchImpl,
      baseUrl: env.MITRA_PUBLIC_RESEARCH_CAMARA_BASE_URL,
    });
    if (!camara || typeof camara.fetch !== "function" || !camara.baseUrl) {
      throw new TypeError("Câmara adapter must expose baseUrl and fetch");
    }

    provider = camara.provider ?? "camara_dados_abertos";
    upstreamBaseUrl = camara.baseUrl;
    upstreamBearer = "";
    researchFetch = camara.fetch;
  }

  const publicResearch = facadeFactory({
    upstreamBaseUrl,
    upstreamBearer,
    allowedOrigins: env.MITRA_PUBLIC_RESEARCH_ALLOWED_ORIGINS,
    fetchImpl: researchFetch,
    timeoutMs: numericEnv(env, "MITRA_PUBLIC_RESEARCH_TIMEOUT_MS", 12_000),
    rateLimitMax: numericEnv(env, "MITRA_PUBLIC_RESEARCH_RATE_LIMIT_MAX", 30),
    rateLimitWindowMs: numericEnv(env, "MITRA_PUBLIC_RESEARCH_RATE_LIMIT_WINDOW_MS", 60_000),
  });

  if (typeof publicResearch?.handleRequest !== "function") {
    throw new TypeError("Mitra public research facade must expose handleRequest");
  }

  const wrappedApp = Object.freeze({
    async handleRequest(request = {}) {
      const result = await publicResearch.handleRequest(request);
      if (result) return result;
      return app.handleRequest(request);
    },
  });

  return Object.freeze({
    app: wrappedApp,
    descriptor: Object.freeze({
      enabled: true,
      configured: publicResearch.configured === true,
      provider,
      routes: Object.freeze([
        "GET /v1/mitra/public/health",
        "OPTIONS /v1/mitra/public/search",
        "POST /v1/mitra/public/search",
      ]),
      writeExecuted: false,
    }),
  });
}

export function attachMitraPublicResearchToGateway({
  gateway,
  env = process.env,
  facadeFactory = createMitraPublicResearchFacade,
  camaraAdapterFactory = createMitraPublicCamaraFetchAdapter,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!gateway || typeof gateway !== "object") {
    throw new TypeError("gateway is required");
  }

  const wrapped = createMitraPublicOperationalWrapper({
    app: gateway.app,
    env,
    facadeFactory,
    camaraAdapterFactory,
    fetchImpl,
  });

  return Object.freeze({
    ...gateway,
    app: wrapped.app,
    mitraPublicResearch: wrapped.descriptor,
  });
}
