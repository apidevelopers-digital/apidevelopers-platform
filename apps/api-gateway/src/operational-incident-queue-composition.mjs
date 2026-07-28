import { createOperationalGateway } from "./operational-composition.mjs";
import {
  createGlobalTrustIncidentQueue,
} from "./global-trust-incident-queue.mjs";
import {
  createGlobalTrustIncidentQueueHttpApp,
} from "./global-trust-incident-queue-http.mjs";
import {
  createGlobalTrustIncidentQueueIntegrity,
} from "./global-trust-incident-queue-integrity.mjs";

export function createIncidentQueueOperationalGateway({
  incidentIdFactory,
  incidentEventIdFactory,
  incidentNow,
  incidentIntegrityNow,
  incidentProofIdFactory,
  ...operationalOptions
} = {}) {
  const base = createOperationalGateway(operationalOptions);
  const incidentIntegrity = createGlobalTrustIncidentQueueIntegrity({
    store: base.store,
    ...(incidentIntegrityNow ? { now: incidentIntegrityNow } : {}),
    ...(incidentProofIdFactory
      ? { proofIdFactory: incidentProofIdFactory }
      : {}),
  });
  const incidentQueue = createGlobalTrustIncidentQueue({
    store: base.store,
    integrity: incidentIntegrity,
    ...(incidentIdFactory ? { incidentIdFactory } : {}),
    ...(incidentEventIdFactory
      ? { eventIdFactory: incidentEventIdFactory }
      : {}),
    ...(incidentNow ? { now: incidentNow } : {}),
  });
  const app = createGlobalTrustIncidentQueueHttpApp({
    app: base.app,
    authenticator: base.authenticator,
    authorization: base.authorization,
    incidentQueue,
    integrity: incidentIntegrity,
  });

  return Object.freeze({
    ...base,
    incidentIntegrity,
    incidentQueue,
    app,
  });
}
