import { rm } from "node:fs/promises";

import {
  createGlobalTrustStagingControlAdapter,
} from "./global-trust-staging-control-adapter.mjs";
import {
  buildGlobalTrustStagingOperationalBindings,
  verifyGlobalTrustStagingOperationalIntegrity,
} from "./global-trust-staging-operational-bindings.mjs";
import {
  DEFAULT_TENANT_ID,
  seedStagingRegistries,
} from "./global-trust-staging-operational-fixtures.mjs";

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

export function createGlobalTrustStagingOperationalAdapter({
  gateway,
  workspacePath,
  tenantId = DEFAULT_TENANT_ID,
  nullProvider,
} = {}) {
  if (!gateway || typeof gateway !== "object") {
    throw new TypeError("gateway is required");
  }
  const normalizedWorkspacePath = required(
    workspacePath,
    "workspacePath",
  );
  const normalizedTenantId = required(
    tenantId,
    "tenantId",
  );
  if (normalizedTenantId !== DEFAULT_TENANT_ID) {
    throw new TypeError(
      `tenantId must be ${DEFAULT_TENANT_ID}`,
    );
  }
  if (
    !nullProvider
    || nullProvider.mode !== "null"
    || nullProvider.contactEnabled !== false
    || typeof nullProvider.infer !== "function"
  ) {
    throw new TypeError(
      "a non-contacting nullProvider is required",
    );
  }

  let seeded = false;
  const adapter = createGlobalTrustStagingControlAdapter({
    bindings:
      buildGlobalTrustStagingOperationalBindings({
        gateway,
        tenantId: normalizedTenantId,
        nullProvider,
      }),

    async assertEnvironment({
      manifest,
      networkGuard,
    }) {
      const safeComposition =
        gateway.composition?.inferenceRouteEnabled
          === false
        && gateway.composition?.modelExecutionEnabled
          === false
        && gateway.composition?.toolExecutionEnabled
          === false
        && gateway.composition?.providerContactEnabled
          === false
        && gateway.composition?.deploymentExecuted
          === false
        && gateway.composition
          ?.automaticRemediationEnabled === false;

      if (
        manifest.tenantId !== normalizedTenantId
        || networkGuard?.installed !== true
        || nullProvider.contactEnabled !== false
        || !safeComposition
      ) {
        const error = new Error(
          "operational staging environment contract rejected",
        );
        error.code =
          "STAGING_OPERATIONAL_ENVIRONMENT_REJECTED";
        throw error;
      }
      return Object.freeze({ safe: true });
    },

    async seed() {
      if (seeded) {
        return Object.freeze({
          seeded: true,
          reused: true,
        });
      }
      await seedStagingRegistries(
        gateway,
        normalizedTenantId,
      );
      seeded = true;
      return Object.freeze({
        seeded: true,
        reused: false,
      });
    },

    async verifyIntegrity() {
      return verifyGlobalTrustStagingOperationalIntegrity(
        gateway,
        normalizedTenantId,
      );
    },

    async cleanup() {
      await rm(normalizedWorkspacePath, {
        recursive: true,
        force: true,
      });
      return Object.freeze({
        cleaned: true,
        residualResources: 0,
      });
    },
  });

  return Object.freeze({
    contractType:
      "GlobalTrustStagingOperationalAdapterBundle",
    contractVersion: "1.0",
    tenantId: normalizedTenantId,
    workspacePath: normalizedWorkspacePath,
    adapter,
  });
}
