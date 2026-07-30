import { pathToFileURL } from "node:url";

import { createWordPressReadOnlyAdapter } from "../packages/wordpress-adapter/src/index.mjs";

const requireEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const createReadOnlyFetch = (fetchImpl = globalThis.fetch) => {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  return async (url, init = {}) => {
    const method = String(init.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      const error = new Error(`Blocked non-read-only HTTP method: ${method}`);
      error.code = "non_read_only_method_blocked";
      throw error;
    }

    return fetchImpl(url, { ...init, method: "GET" });
  };
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      const error = new Error("WordPress returned an invalid JSON response");
      error.code = "invalid_json_response";
      error.status = response.status;
      throw error;
    }
  }

  if (!response.ok) {
    const error = new Error(
      payload?.message ?? `WordPress request failed with HTTP ${response.status}`,
    );
    error.code = payload?.code ?? "wordpress_request_failed";
    error.status = response.status;
    throw error;
  }

  return payload;
};

export const runWordPressAuthProbe = async ({
  baseUrl,
  username,
  applicationPassword,
  fetchImpl = globalThis.fetch,
  adapterFactory = createWordPressReadOnlyAdapter,
}) => {
  const safeFetch = createReadOnlyFetch(fetchImpl);
  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, "");
  const authorization = `Basic ${Buffer.from(
    `${username}:${applicationPassword}`,
    "utf8",
  ).toString("base64")}`;

  const adapter = adapterFactory({
    baseUrl: normalizedBaseUrl,
    auth: {
      type: "application-password",
      username,
      applicationPassword,
    },
    fetchImpl: safeFetch,
  });

  const discovery = await adapter.discover();
  const auth = await adapter.validateAuthentication();

  const pagesUrl = new URL(`${normalizedBaseUrl}/wp-json/wp/v2/pages`);
  pagesUrl.searchParams.set("_fields", "id");
  pagesUrl.searchParams.set("per_page", "1");

  const pagesResponse = await safeFetch(pagesUrl, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: authorization,
    },
  });
  const pages = await parseJsonResponse(pagesResponse);

  return {
    ok: true,
    mode: "read-only",
    readyForApply: false,
    writesEnabled: false,
    discovery: {
      hasWpV2: Boolean(discovery.hasWpV2),
      hasPagesRoute: Boolean(discovery.hasPagesRoute),
    },
    authentication: {
      validated: Boolean(auth.validated),
    },
    pages: {
      total: Number(pagesResponse.headers.get("x-wp-total") ?? pages?.length ?? 0),
      totalPages: Number(pagesResponse.headers.get("x-wp-totalpages") ?? 0),
    },
  };
};

const main = async () => {
  const result = await runWordPressAuthProbe({
    baseUrl: requireEnv("WORDPRESS_URL"),
    username: requireEnv("WORDPRESS_USERNAME"),
    applicationPassword: requireEnv("WORDPRESS_APP_PASSWORD"),
  });

  console.log(JSON.stringify(result, null, 2));
};

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          mode: "read-only",
          readyForApply: false,
          writesEnabled: false,
          error: {
            name: error?.name ?? "Error",
            code: error?.code ?? "probe_failed",
            status: error?.status ?? null,
            message: error?.message ?? "WordPress probe failed",
          },
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
