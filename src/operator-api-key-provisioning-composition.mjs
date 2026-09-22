import { createGatewayKeyProvisioner } from "./operator-api-key-provisioning.mjs";
import { createOperatorApiKeyProvisioningHttpApp } from "./operator-api-key-provisioning-http.mjs";

export function createOperatorApiKeyProvisioningRuntimeApp({
  authenticator,
  apiKeyLifecycle,
  requiredScope = "operator:resource:read",
} = {}) {
  if (!authenticator || typeof authenticator.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (!apiKeyLifecycle || typeof apiKeyLifecycle.issueApiKey !== "function") {
    throw new TypeError("apiKeyLifecycle.issueApiKey must be a function");
  }

  const provisioner = createGatewayKeyProvisioner({
    lifecycleService: apiKeyLifecycle,
  });

  return createOperatorApiKeyProvisioningHttpApp({
    authenticator,
    provisioner,
    requiredScope,
  });
}
