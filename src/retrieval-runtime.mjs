
import {
  createFederatedRetrieval,
  createGovernedContentGate,
  createPeterleMailConnector,
  createUnicoWhatsAppConnector,
  createPeterleMitraConnector,
} from "../../../packages/kernel-retrieval/src/index.mjs";

function requiredFunction(value, name) {
  if (typeof value !== "function") {
    const error = new TypeError(`${name} function is required`);
    error.code = "RETRIEVAL_RUNTIME_DEPENDENCY_REQUIRED";
    throw error;
  }
  return value;
}

export function createRetrievalRuntime({
  enabled = false,
  tenantId,
  services = {},
  providers = {},
  redact,
  clock,
} = {}) {
  if (enabled !== true) {
    return Object.freeze({
      enabled: false,
      status: "disabled",
      search: async () => {
        const error = new Error("Retrieval runtime is disabled");
        error.code = "RETRIEVAL_RUNTIME_DISABLED";
        throw error;
      },
      fetchContent: async () => {
        const error = new Error("Retrieval runtime is disabled");
        error.code = "RETRIEVAL_RUNTIME_DISABLED";
        throw error;
      },
    });
  }

  const authorize = requiredFunction(services.authorize, "services.authorize");
  const evaluatePolicy = requiredFunction(services.evaluatePolicy, "services.evaluatePolicy");
  const audit = requiredFunction(services.audit, "services.audit");
  const redactFn = requiredFunction(redact, "redact");

  const connectors = [];

  if (typeof providers.searchMail === "function") {
    connectors.push(createPeterleMailConnector({
      account: providers.mailAccount,
      searchMail: providers.searchMail,
    }));
  }

  if (typeof providers.searchWhatsappInbound === "function") {
    connectors.push(createUnicoWhatsAppConnector({
      searchInbound: providers.searchWhatsappInbound,
      domain: providers.whatsappDomain || "corporate",
    }));
  }

  if (
    typeof providers.searchPeterleClients === "function" &&
    typeof providers.searchPeterleMatters === "function"
  ) {
    connectors.push(createPeterleMitraConnector({
      searchClients: providers.searchPeterleClients,
      searchMatters: providers.searchPeterleMatters,
    }));
  }

  const retrieval = createFederatedRetrieval({
    tenantId,
    connectors,
    ...(clock ? { clock } : {}),
  });

  const contentGate = createGovernedContentGate({
    tenantId,
    authorize,
    evaluatePolicy,
    audit,
    redact: redactFn,
    ...(clock ? { clock } : {}),
  });

  for (const resolver of providers.contentResolvers || []) {
    contentGate.register(resolver);
  }

  return Object.freeze({
    enabled: true,
    status: "ready",
    connectorIds: Object.freeze(retrieval.connectors().map((item) => item.id)),
    resolverIds: Object.freeze(contentGate.resolvers()),
    search: retrieval.search,
    fetchContent: contentGate.fetch,
  });
}
