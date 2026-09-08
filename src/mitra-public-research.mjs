const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
});

const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "https://preview-apidevelopers.apidevelopers.digital",
  "https://mitra.apidevelopers.digital",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RATE_LIMIT_MAX = 30;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_QUERY_LENGTH = 500;
const MAX_LIMIT = 20;

export class MitraPublicResearchError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "MitraPublicResearchError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function jsonResponse(status, payload, headers = JSON_HEADERS) {
  return {
    status,
    headers,
    body: JSON.stringify(payload),
  };
}

function normalizeBaseUrl(value) {
  const raw = String(value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "";

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError("MITRA_PUBLIC_RESEARCH_UPSTREAM_BASE_URL must be a valid URL");
  }

  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) {
    throw new TypeError("MITRA public research upstream must use HTTPS outside localhost");
  }

  return url.toString().replace(/\/+$/, "");
}

function normalizeAllowedOrigins(value) {
  if (Array.isArray(value)) {
    return new Set(value.map((item) => String(item).trim()).filter(Boolean));
  }

  const raw = String(value ?? "").trim();
  if (!raw) return new Set(DEFAULT_ALLOWED_ORIGINS);

  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

function corsHeaders(origin, allowedOrigins, extra = {}) {
  const normalizedOrigin = String(origin ?? "").trim();
  if (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin)) {
    return Object.freeze({
      ...JSON_HEADERS,
      ...extra,
      vary: "Origin",
    });
  }

  return Object.freeze({
    ...JSON_HEADERS,
    ...extra,
    "access-control-allow-origin": normalizedOrigin,
    vary: "Origin",
  });
}

function parseBody(body) {
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  if (typeof body !== "string" || !body.trim()) {
    throw new MitraPublicResearchError(400, "request_body_required", "Informe a pesquisa em JSON.");
  }

  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid object");
    }
    return parsed;
  } catch {
    throw new MitraPublicResearchError(400, "invalid_json", "O corpo da pesquisa deve ser um objeto JSON válido.");
  }
}

function normalizeQuery(value) {
  const query = String(value ?? "").trim();
  if (!query) {
    throw new MitraPublicResearchError(400, "query_required", "Digite um termo para pesquisar.");
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new MitraPublicResearchError(400, "query_too_long", `A pesquisa deve ter no máximo ${MAX_QUERY_LENGTH} caracteres.`);
  }
  return query;
}

function normalizeLimit(value) {
  const numeric = Number(value ?? 8);
  if (!Number.isFinite(numeric)) return 8;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(numeric)));
}

function text(value, max = 2_000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function safeHttpsUrl(value) {
  const raw = text(value, 1_000);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeResult(row, fallbackSource, fallbackUrl) {
  const item = row && typeof row === "object" ? row : {};
  const raw = item.raw && typeof item.raw === "object" ? item.raw : {};

  const title = text(
    item.title ??
      item.titulo ??
      item.ementa ??
      raw.titulo ??
      raw.nome ??
      raw.ementa ??
      raw.title ??
      raw.numeroProcesso ??
      "Resultado",
    240,
  );

  const summary = text(
    item.summary ??
      item.resumo ??
      item.snippet ??
      raw.resumo ??
      raw.ementa ??
      raw.descricao ??
      raw.description ??
      raw.texto ??
      "",
    1_500,
  );

  const source = text(item.source ?? fallbackSource ?? "Fonte pública", 180);
  const sourceUrl = safeHttpsUrl(item.source_url ?? item.sourceUrl ?? fallbackUrl);
  const date = text(item.date ?? item.data ?? raw.data ?? raw.date ?? raw.dataPublicacao ?? "", 100);
  const citation =
    text(item.citation ?? item.citacao ?? item.reference ?? "", 1_000) ||
    [title, source, date].filter(Boolean).join(". ");

  return Object.freeze({
    title,
    summary,
    source,
    source_url: sourceUrl,
    citation,
    date,
  });
}

function normalizeUpstreamPayload(payload, limit) {
  const data = payload && typeof payload === "object" ? payload : {};
  const rows = Array.isArray(data.results) ? data.results : [];
  const fallbackSource = text(data.source ?? "Mitra Public Research", 180);
  const fallbackUrl = safeHttpsUrl(data.source_url ?? data.sourceUrl);

  return Object.freeze({
    ok: data.ok !== false,
    source: fallbackSource,
    results: Object.freeze(
      rows.slice(0, limit).map((row) => normalizeResult(row, fallbackSource, fallbackUrl)),
    ),
    confidence: text(data.confidence ?? "", 80),
    legal_warning: text(
      data.legal_warning ??
        "Pesquisa pública auxiliar; validar a fonte e revisar profissionalmente antes de qualquer decisão.",
      500,
    ),
    queried_at: text(data.queried_at ?? new Date().toISOString(), 100),
  });
}

function clientKeyFromHeaders(headers = {}) {
  const realIp = text(headers["x-real-ip"] ?? headers["cf-connecting-ip"] ?? "", 120);
  if (realIp) return realIp;

  const forwarded = text(headers["x-forwarded-for"] ?? "", 500);
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 120) || "anonymous";

  return "anonymous";
}

function createRateLimiter({ now, max, windowMs }) {
  const buckets = new Map();

  return {
    consume(key) {
      if (max <= 0) return { allowed: true, remaining: 0, resetAt: now() + windowMs };

      const current = now();
      const previous = buckets.get(key);
      const bucket =
        !previous || current >= previous.resetAt
          ? { count: 0, resetAt: current + windowMs }
          : previous;

      if (bucket.count >= max) {
        buckets.set(key, bucket);
        return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
      }

      bucket.count += 1;
      buckets.set(key, bucket);
      return {
        allowed: true,
        remaining: Math.max(0, max - bucket.count),
        resetAt: bucket.resetAt,
      };
    },
  };
}

export function createMitraPublicResearchFacade({
  upstreamBaseUrl = process.env.MITRA_PUBLIC_RESEARCH_UPSTREAM_BASE_URL,
  upstreamBearer = process.env.MITRA_PUBLIC_RESEARCH_UPSTREAM_BEARER,
  allowedOrigins = process.env.MITRA_PUBLIC_RESEARCH_ALLOWED_ORIGINS,
  fetchImpl = globalThis.fetch,
  timeoutMs = Number(process.env.MITRA_PUBLIC_RESEARCH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  rateLimitMax = Number(process.env.MITRA_PUBLIC_RESEARCH_RATE_LIMIT_MAX ?? DEFAULT_RATE_LIMIT_MAX),
  rateLimitWindowMs = Number(
    process.env.MITRA_PUBLIC_RESEARCH_RATE_LIMIT_WINDOW_MS ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
  ),
  now = () => Date.now(),
} = {}) {
  const baseUrl = normalizeBaseUrl(upstreamBaseUrl);
  const origins = normalizeAllowedOrigins(allowedOrigins);
  const bearer = text(upstreamBearer, 4_000);
  const timeout = Math.max(1_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
  const limiter = createRateLimiter({
    now,
    max: Math.max(0, Math.floor(Number(rateLimitMax) || DEFAULT_RATE_LIMIT_MAX)),
    windowMs: Math.max(1_000, Number(rateLimitWindowMs) || DEFAULT_RATE_LIMIT_WINDOW_MS),
  });

  if (fetchImpl !== undefined && typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  function response(status, payload, origin, extraHeaders = {}) {
    return jsonResponse(status, payload, corsHeaders(origin, origins, extraHeaders));
  }

  function ensureOrigin(origin) {
    const normalized = String(origin ?? "").trim();
    if (!normalized) return;
    if (!origins.has(normalized)) {
      throw new MitraPublicResearchError(403, "origin_not_allowed", "Origem não autorizada para a pesquisa pública.");
    }
  }

  return Object.freeze({
    configured: Boolean(baseUrl),
    allowedOrigins: Object.freeze([...origins]),

    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
      body,
    } = {}) {
      const normalizedMethod = String(method).toUpperCase();
      const requestUrl = new URL(String(url), "http://api-gateway.local");
      const pathname = requestUrl.pathname;
      const origin = headers.origin;

      if (pathname === "/v1/mitra/public/health" && normalizedMethod === "GET") {
        try {
          ensureOrigin(origin);
        } catch (error) {
          if (error instanceof MitraPublicResearchError) {
            return response(error.status, { ok: false, error: error.code, message: error.message }, origin);
          }
          throw error;
        }

        return response(
          baseUrl ? 200 : 503,
          {
            ok: Boolean(baseUrl),
            service: "mitra-public-research",
            status: baseUrl ? "ready" : "not_configured",
            write_executed: false,
          },
          origin,
        );
      }

      if (pathname === "/v1/mitra/public/search" && normalizedMethod === "OPTIONS") {
        try {
          ensureOrigin(origin);
        } catch (error) {
          if (error instanceof MitraPublicResearchError) {
            return response(error.status, { ok: false, error: error.code, message: error.message }, origin);
          }
          throw error;
        }

        return {
          status: 204,
          headers: corsHeaders(origin, origins, {
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
            "access-control-max-age": "600",
          }),
          body: "",
        };
      }

      if (pathname !== "/v1/mitra/public/search" || normalizedMethod !== "POST") {
        return null;
      }

      try {
        ensureOrigin(origin);

        const rate = limiter.consume(clientKeyFromHeaders(headers));
        if (!rate.allowed) {
          const retryAfter = Math.max(1, Math.ceil((rate.resetAt - now()) / 1_000));
          return response(
            429,
            {
              ok: false,
              error: "rate_limited",
              message: "Limite temporário de pesquisas atingido. Tente novamente em instantes.",
            },
            origin,
            { "retry-after": String(retryAfter) },
          );
        }

        if (!baseUrl) {
          throw new MitraPublicResearchError(
            503,
            "upstream_not_configured",
            "A pesquisa jurídica pública ainda não está conectada neste ambiente.",
          );
        }

        if (typeof fetchImpl !== "function") {
          throw new MitraPublicResearchError(503, "fetch_unavailable", "Transporte HTTP indisponível.");
        }

        const payload = parseBody(body);
        const query = normalizeQuery(payload.query ?? payload.q);
        const limit = normalizeLimit(payload.limit);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
          const upstreamHeaders = {
            accept: "application/json",
            "content-type": "application/json",
          };
          if (bearer) upstreamHeaders.authorization = `Bearer ${bearer}`;

          const upstreamResponse = await fetchImpl(`${baseUrl}/search/global`, {
            method: "POST",
            headers: upstreamHeaders,
            body: JSON.stringify({ q: query, limit }),
            signal: controller.signal,
            redirect: "error",
            cache: "no-store",
          });

          let upstreamPayload = null;
          try {
            upstreamPayload = await upstreamResponse.json();
          } catch {
            upstreamPayload = null;
          }

          if (!upstreamResponse.ok) {
            const detail =
              upstreamPayload && typeof upstreamPayload === "object"
                ? upstreamPayload.detail ?? upstreamPayload.message ?? upstreamPayload.error
                : null;
            const clientStatus =
              upstreamResponse.status >= 400 && upstreamResponse.status < 500 ? 400 : 502;

            throw new MitraPublicResearchError(
              clientStatus,
              "upstream_rejected",
              text(detail, 500) || "A fonte pública não respondeu como esperado.",
            );
          }

          return response(200, normalizeUpstreamPayload(upstreamPayload, limit), origin);
        } catch (error) {
          if (error instanceof MitraPublicResearchError) throw error;
          if (error?.name === "AbortError") {
            throw new MitraPublicResearchError(
              504,
              "upstream_timeout",
              "A pesquisa pública demorou mais que o permitido.",
            );
          }
          throw new MitraPublicResearchError(
            502,
            "upstream_unavailable",
            "Não foi possível consultar a fonte jurídica pública.",
          );
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        if (error instanceof MitraPublicResearchError) {
          return response(
            error.status,
            {
              ok: false,
              error: error.code,
              message: error.message,
              write_executed: false,
            },
            origin,
          );
        }
        throw error;
      }
    },
  });
}
