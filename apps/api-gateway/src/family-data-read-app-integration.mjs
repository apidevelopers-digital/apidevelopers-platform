import { createApp } from "./server.mjs";
import { createFamilyDataReadGatewayBinding } from "./family-data-read-gateway-binding.mjs";

function assertApp(app) {
  if (!app || typeof app.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  return app;
}

function assertBinding(binding) {
  if (!binding || typeof binding.handleRequest !== "function" || typeof binding.status !== "function") {
    throw new TypeError("familyDataBinding must expose handleRequest and status functions");
  }
  return binding;
}

export function createAppWithFamilyDataRead({
  app,
  appOptions,
  familyDataBinding = createFamilyDataReadGatewayBinding()
} = {}) {
  if (app !== undefined && appOptions !== undefined) {
    throw new TypeError("provide app or appOptions, not both");
  }

  const baseApp = assertApp(app ?? createApp(appOptions));
  const binding = assertBinding(familyDataBinding);

  return Object.freeze({
    familyDataStatus() {
      return binding.status();
    },

    async handleRequest(request = {}) {
      const familyDataResponse = await binding.handleRequest(request);
      if (familyDataResponse) return familyDataResponse;
      return baseApp.handleRequest(request);
    }
  });
}
