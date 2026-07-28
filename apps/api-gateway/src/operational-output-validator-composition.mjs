import { createOperationalGateway } from "./operational-composition.mjs";
import {
  createGlobalTrustOutputValidator,
} from "./global-trust-output-validator.mjs";
import {
  createGlobalTrustOutputValidatorHttpApp,
} from "./global-trust-output-validator-http.mjs";
import {
  createGlobalTrustOutputValidatorIntegrity,
} from "./global-trust-output-validator-integrity.mjs";

export function createOutputValidatedOperationalGateway({
  outputValidatorDecisionIdFactory,
  outputValidatorNow,
  outputValidatorIntegrityNow,
  outputValidatorProofIdFactory,
  ...operationalOptions
} = {}) {
  const base = createOperationalGateway(operationalOptions);
  const outputValidatorIntegrity = createGlobalTrustOutputValidatorIntegrity({
    store: base.store,
    ...(outputValidatorIntegrityNow
      ? { now: outputValidatorIntegrityNow }
      : {}),
    ...(outputValidatorProofIdFactory
      ? { proofIdFactory: outputValidatorProofIdFactory }
      : {}),
  });
  const outputValidator = createGlobalTrustOutputValidator({
    store: base.store,
    integrity: outputValidatorIntegrity,
    ...(outputValidatorDecisionIdFactory
      ? { decisionIdFactory: outputValidatorDecisionIdFactory }
      : {}),
    ...(outputValidatorNow ? { now: outputValidatorNow } : {}),
  });
  const app = createGlobalTrustOutputValidatorHttpApp({
    app: base.app,
    authenticator: base.authenticator,
    authorization: base.authorization,
    outputValidator,
    integrity: outputValidatorIntegrity,
  });

  return Object.freeze({
    ...base,
    outputValidatorIntegrity,
    outputValidator,
    app,
  });
}
