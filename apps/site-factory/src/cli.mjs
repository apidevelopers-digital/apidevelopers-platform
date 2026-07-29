#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { HostingerReadOnlyAdapter } from "@apidevelopers/hostinger-adapter";
import { WordPressReadOnlyAdapter } from "@apidevelopers/wordpress-adapter";

import { loadSiteManifest } from "./manifest.mjs";
import { createSiteFactoryDryRun } from "./planner.mjs";

function parseArgs(argv) {
  const options = {
    manifest: null,
    output: null,
    publicOnly: false,
    manifestOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest") {
      options.manifest = argv[index + 1];
      index += 1;
    } else if (argument === "--output") {
      options.output = argv[index + 1];
      index += 1;
    } else if (argument === "--public-only") {
      options.publicOnly = true;
    } else if (argument === "--manifest-only") {
      options.manifestOnly = true;
    } else {
      throw new TypeError(`unknown argument: ${argument}`);
    }
  }

  if (!options.manifest) {
    throw new TypeError("--manifest is required");
  }

  return Object.freeze(options);
}

function createWordPressAuth(env, bearerToken = null) {
  if (bearerToken) {
    return Object.freeze({ type: "bearer", token: bearerToken });
  }

  if (env.WORDPRESS_USERNAME && env.WORDPRESS_APPLICATION_PASSWORD) {
    return Object.freeze({
      type: "application-password",
      username: env.WORDPRESS_USERNAME,
      applicationPassword: env.WORDPRESS_APPLICATION_PASSWORD,
    });
  }

  if (env.WORDPRESS_BEARER_TOKEN) {
    return Object.freeze({
      type: "bearer",
      token: env.WORDPRESS_BEARER_TOKEN,
    });
  }

  return null;
}

function selectInstallation(inventory) {
  return (
    inventory?.wordpressInstallations?.find(
      (installation) =>
        installation.valid !== false && installation.username && installation.id,
    ) ?? null
  );
}

export async function runSiteFactoryDryRun({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
} = {}) {
  const options = parseArgs(argv);
  const { path, manifest } = await loadSiteManifest(options.manifest);

  if (options.manifestOnly) {
    const report = Object.freeze({
      schemaVersion: 1,
      mode: "manifest-validation",
      generatedAt: now(),
      manifestPath: path,
      site: manifest.site,
      desiredPages: manifest.wordpress.pages.length,
      valid: true,
      writesEnabled: false,
    });
    await emitReport(report, options.output);
    return report;
  }

  let hostingerInventory = null;
  let bearerToken = null;

  if (!options.publicOnly && env.HOSTINGER_API_TOKEN) {
    const hostinger = new HostingerReadOnlyAdapter({
      baseUrl: env.HOSTINGER_API_BASE_URL ?? "https://developers.hostinger.com",
      token: env.HOSTINGER_API_TOKEN,
      fetchImpl,
    });
    hostingerInventory = await hostinger.inventoryDomain(manifest.hostinger.domain);

    const installation = selectInstallation(hostingerInventory);
    if (
      installation &&
      !env.WORDPRESS_APPLICATION_PASSWORD &&
      !env.WORDPRESS_BEARER_TOKEN
    ) {
      const jwt = await hostinger.getWordPressInstallationJwtToken({
        username: installation.username,
        software: installation.id,
      });
      bearerToken = jwt.token;
    }
  }

  const publicWordPress = new WordPressReadOnlyAdapter({
    baseUrl: manifest.wordpress.baseUrl,
    fetchImpl,
  });
  const wordpressDiscovery = await publicWordPress.discover();

  let wordpressAuthentication = null;
  let pagePlan = null;
  const auth = createWordPressAuth(env, bearerToken);

  if (!options.publicOnly && auth) {
    const authenticatedWordPress = new WordPressReadOnlyAdapter({
      baseUrl: manifest.wordpress.baseUrl,
      auth,
      fetchImpl,
    });
    wordpressAuthentication = await authenticatedWordPress.validateAuthentication();
    const existingPages = await authenticatedWordPress.listPages();
    pagePlan = authenticatedWordPress.planPages(
      manifest.wordpress.pages,
      existingPages.data,
    );
  }

  const report = createSiteFactoryDryRun({
    manifest,
    hostingerInventory,
    wordpressDiscovery,
    wordpressAuthentication,
    pagePlan,
    generatedAt: now(),
  });

  await emitReport(report, options.output);
  return report;
}

async function emitReport(report, output) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    const path = resolve(output);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, serialized, { encoding: "utf8", mode: 0o600 });
  }
  process.stdout.write(serialized);
}

async function main() {
  try {
    await runSiteFactoryDryRun();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        event: "site_factory_dry_run_failed",
        name: error?.name ?? "Error",
        message: error instanceof Error ? error.message : "Unknown error",
      })}\n`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
