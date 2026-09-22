export function createOperatorApiKeyProvisioningWrapper({
  app,
  operatorApiKeyProvisioningApp,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (typeof operatorApiKeyProvisioningApp?.handleRequest !== "function") {
    throw new TypeError("operatorApiKeyProvisioningApp.handleRequest must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const operatorResponse = await operatorApiKeyProvisioningApp.handleRequest(request);
      if (operatorResponse) return operatorResponse;
      return app.handleRequest(request);
    },
  });
}
