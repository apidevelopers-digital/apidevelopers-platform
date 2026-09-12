import { createMitraProfessionalFacade as createUpstreamMitraProfessionalFacade } from "./mitra-professional-facade.mjs";
import { createMitraEmbeddedLexTransport } from "./mitra-embedded-lex-transport.mjs";
import { LEX_SOURCE_SHA, mitraProfessionalOrchestrator } from "@apidevelopers/lex-legal-runtime";

const EMBEDDED_AUTH_MARKER = "embedded-local-no-network";

function createMitraProfessionalFacade(options = {}) {
  const { embeddedLexDispatch, ...upstreamOptions } = options;
  const dispatch = typeof embeddedLexDispatch === "function"
    ? embeddedLexDispatch
    : mitraProfessionalOrchestrator.dispatch.bind(mitraProfessionalOrchestrator);
  const transport = createMitraEmbeddedLexTransport({ dispatch });
  const baseEnv = upstreamOptions.env || process.env;
  const env = {
    ...baseEnv,
    MITRA_PROFESSIONAL_ORCHESTRATOR_BASE_URL: transport.baseUrl,
    MITRA_PROFESSIONAL_ORCHESTRATOR_BEARER: EMBEDDED_AUTH_MARKER,
  };

  return createUpstreamMitraProfessionalFacade({
    ...upstreamOptions,
    env,
    fetchImpl: transport.fetchImpl,
    upstreamBaseUrl: transport.baseUrl,
    upstreamBearer: EMBEDDED_AUTH_MARKER,
  });
}

export * from "./mitra-professional-facade.mjs";
export {
  EMBEDDED_AUTH_MARKER,
  LEX_SOURCE_SHA,
  createMitraProfessionalFacade,
};
