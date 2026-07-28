import {
  createGlobalTrustPromptDefense,
} from "./global-trust-prompt-defense.mjs";
import {
  createGlobalTrustPromptDefenseHttpApp,
} from "./global-trust-prompt-defense-http.mjs";
import {
  createGlobalTrustPromptDefenseIntegrity,
} from "./global-trust-prompt-defense-integrity.mjs";
import {
  createDataPolicyRegisteredOperationalGateway,
} from "./operational-data-policy-registry-composition.mjs";

export function createPromptDefendedOperationalGateway({
  promptDefenseDecisionIdFactory,
  promptDefenseNow,
  promptDefenseIntegrityNow,
  promptDefenseProofIdFactory,
  ...dataPolicyRegistryOptions
} = {}) {
  const base = createDataPolicyRegisteredOperationalGateway(
    dataPolicyRegistryOptions,
  );
  const promptDefenseIntegrity = createGlobalTrustPromptDefenseIntegrity({
    store: base.store,
    ...(promptDefenseIntegrityNow
      ? { now: promptDefenseIntegrityNow }
      : {}),
    ...(promptDefenseProofIdFactory
      ? { proofIdFactory: promptDefenseProofIdFactory }
      : {}),
  });
  const promptDefense = createGlobalTrustPromptDefense({
    store: base.store,
    integrity: promptDefenseIntegrity,
    ...(promptDefenseDecisionIdFactory
      ? { decisionIdFactory: promptDefenseDecisionIdFactory }
      : {}),
    ...(promptDefenseNow ? { now: promptDefenseNow } : {}),
  });
  const app = createGlobalTrustPromptDefenseHttpApp({
    app: base.app,
    authenticator: base.authenticator,
    authorization: base.authorization,
    promptDefense,
  });

  return Object.freeze({
    ...base,
    promptDefenseIntegrity,
    promptDefense,
    app,
  });
}
