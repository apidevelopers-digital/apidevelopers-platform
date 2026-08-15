import {
  createGlobalTrustOutputValidator,
} from "./global-trust-output-validator.mjs";
import {
  createGlobalTrustOutputValidatorHttpApp,
} from "./global-trust-output-validator-http.mjs";
import {
  createGlobalTrustOutputValidatorIntegrity,
} from "./global-trust-output-validator-integrity.mjs";
import {
  createPromptDefendedOperationalGateway,
} from "./operational-prompt-defense-composition.mjs";

export function createOutputValidatedOperationalGateway({
  outputValidatorDecisionIdFactory,
  outputValidatorNow,
  outputValidatorIntegrityNow,
  outputValidatorProofIdFactory,
  ...promptDefenseOptions
} = {}) {
  const base = createPromptDefendedOperationalGateway(promptDefenseOptions);
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
