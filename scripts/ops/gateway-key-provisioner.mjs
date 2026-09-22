#!/usr/bin/env node

import { createGatewayKeyProvisioner } from "../../apps/api-gateway/src/operator-api-key-provisioning.mjs";

const MODE = process.env.GATEWAY_KEY_PROVISIONER_MODE || "dry-run";
const TENANT_ID = process.env.GATEWAY_KEY_PROVISIONER_TENANT_ID || "";
const KEY_NAME = process.env.GATEWAY_KEY_PROVISIONER_KEY_NAME || "ada-mitra-bridge-read";
const SCOPES = (process.env.GATEWAY_KEY_PROVISIONER_SCOPES || "ada:mitra:read")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);
const REQUESTED_BY = process.env.GATEWAY_KEY_PROVISIONER_REQUESTED_BY || "Igor";
const REASON = process.env.GATEWAY_KEY_PROVISIONER_REASON || "not_specified";
const CONFIRMATION = process.env.GATEWAY_KEY_PROVISIONER_CONFIRMATION || "";

function emit(key, value) {
  console.log(`GATEWAY_KEY_PROVISIONER_${key}=${String(value)}`);
}

function maskTenant(tenantId) {
  const value = String(tenantId || "");
  if (!value) return "missing";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function createDryRunLifecycleService() {
  return Object.freeze({
    async issueApiKey() {
      throw new Error("real_issue_not_available_in_dry_run_lifecycle");
    },
  });
}

if (MODE !== "dry-run") {
  emit("MODE", MODE);
  emit("FAILURE", "real_issue_surface_not_wired");
  emit("REQUIRED_NEXT_STEP", "wire_runtime_lifecycle_service_before_real_issue");
  process.exit(1);
}

const provisioner = createGatewayKeyProvisioner({
  lifecycleService: createDryRunLifecycleService(),
});

try {
  const plan = provisioner.planIssue({
    tenantId: TENANT_ID,
    name: KEY_NAME,
    scopes: SCOPES,
    requestedBy: REQUESTED_BY,
    reason: REASON,
  });

  emit("MODE", plan.mode);
  emit("SERVICE", plan.service);
  emit("TENANT_PRESENT", TENANT_ID ? "true" : "false");
  emit("TENANT_FINGERPRINT", maskTenant(TENANT_ID));
  emit("KEY_NAME", plan.name);
  emit("SCOPES", plan.scopes.join(","));
  emit("REQUESTED_BY", plan.requestedBy);
  emit("SECRET_RETURNED", plan.secretReturned);
  emit("REQUIRES_APPROVAL", plan.requiresApproval);
  emit("READY_FOR_REAL_WIRING", "true");
} catch (error) {
  emit("MODE", MODE);
  emit("FAILURE", error?.message || "unknown_error");
  process.exit(1);
}
