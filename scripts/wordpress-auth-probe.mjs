import { createWordPressReadOnlyAdapter } from "../packages/wordpress-adapter/src/index.mjs";

const requireEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const main = async () => {
  const baseUrl = requireEnv("WORDPRESS_URL");
  const username = requireEnv("WORDPRESS_USERNAME");
  const applicationPassword = requireEnv("WORDPRESS_APP_PASSWORD");

  const adapter = createWordPressReadOnlyAdapter({
    baseUrl,
    auth: {
      type: "application-password",
      username,
      applicationPassword,
    },
  });

  const discovery = await adapter.discover();
  const auth = await adapter.validateAuthentication();
  const pages = await adapter.listPages();

  const result = {
    ok: true,
    mode: "read-only",
    readyForApply: false,
    writesEnabled: false,
    site: {
      name: discovery.name,
      url: discovery.url,
      hasWpV2: discovery.hasWpV2,
      hasPagesRoute: discovery.hasPagesRoute,
    },
    authentication: {
      validated: auth.validated,
      userId: auth.user.id,
      userSlug: auth.user.slug,
      roles: auth.user.roles,
      canEditPages: auth.user.canEditPages,
      canPublishPages: auth.user.canPublishPages,
    },
    pages: {
      count: pages.data.length,
      total: pages.total,
      totalPages: pages.totalPages,
      ids: pages.data.map(({ id }) => id),
    },
  };

  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(JSON.stringify({
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
  }, null, 2));
  process.exitCode = 1;
});
