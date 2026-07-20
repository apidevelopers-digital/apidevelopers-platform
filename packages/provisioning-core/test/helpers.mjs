import {
  createProvisioningService,
} from "../src/index.mjs";

export const T0 = "2026-07-20T00:00:00.000Z";

export const subscription = (patch = {}) => ({
  subscriptionId: "sub-1",
  accountId: "account-1",
  productId: "platform-core",
  productVersion: 1,
  planId: "developer",
  planVersion: 1,
  status: "active",
  ...patch,
});

export function service() {
  let id = 0;
  let action = 0;
  let tick = 0;
  return createProvisioningService({
    idFactory: () => `snap-${++id}`,
    actionIdFactory: () => `action-${++action}`,
    clock: () =>
      new Date(Date.parse(T0) + tick++ * 1000).toISOString(),
  });
}

export function request(s, patch = {}) {
  return s.requestProvisioning({
    provisioningId: "prov-1",
    subscription: subscription(),
    accountId: "account-1",
    ownerUserId: "user-1",
    tenantName: "Acme",
    tenantSlug: "acme",
    projectName: "Production",
    projectSlug: "production",
    sourceEventId: "subscription-activated-1",
    ...patch,
  });
}

export function start(s) {
  request(s);
  return s.startProvisioning({
    provisioningId: "prov-1",
    sourceEventId: "start-1",
  });
}

export function tenant(s) {
  start(s);
  return s.recordTenantProvisioned({
    provisioningId: "prov-1",
    sourceEventId: "tenant-1",
    tenantId: "tenant-1",
  });
}

export function project(s) {
  tenant(s);
  return s.recordProjectProvisioned({
    provisioningId: "prov-1",
    sourceEventId: "project-1",
    projectId: "project-1",
  });
}
