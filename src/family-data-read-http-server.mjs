import { createHttpServer } from "./server.mjs";
import { createAppWithFamilyDataRead } from "./family-data-read-app-integration.mjs";

export function createHttpServerWithFamilyDataRead({
  app,
  appOptions,
  familyDataBinding,
  maxBodyBytes
} = {}) {
  const composedApp = createAppWithFamilyDataRead({
    ...(app !== undefined ? { app } : {}),
    ...(appOptions !== undefined ? { appOptions } : {}),
    ...(familyDataBinding !== undefined ? { familyDataBinding } : {})
  });

  const server = createHttpServer({
    app: composedApp,
    ...(maxBodyBytes !== undefined ? { maxBodyBytes } : {})
  });

  return Object.freeze({
    server,
    app: composedApp,
    familyDataStatus: () => composedApp.familyDataStatus()
  });
}
