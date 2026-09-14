import { createMitraProfessionalFacade as createUpstreamMitraProfessionalFacade } from "./mitra-professional-facade.mjs";
import { createMitraEmbeddedLexTransport } from "./mitra-embedded-lex-transport.mjs";

const EMBEDED_AUTH_MARKER = "embedded-local-no-network";
const LEX_SOURCE_SHA = "7e7dd2414f07a40787636cba5e08e5d0b800c37f";

function createLazyLexDispatch() {
  return async (payload) => {
    const runtime = await import("@apidevelopers/lex-legal-runtime");
    if (runtime.LEX_SOURCE_SHA !== LEX_SOURCE_SHA) {
      throw new Error("embedded_lex_source_sha_mismatch");
    }
    return runtime.mitraProfessionalOrchestrator.dispatch(payload);
  };
}

function createMitraProfessionalFacade(options = {}) {
  const { embeddedLexDispatch, ...upstreamOptions } = options;
  const dispatch = typeof embeddedLexDispatch === "function"
    ? embeddedLexDispatch
    : createLazyLexDispatch();
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
    upstreamBearer: EMBEDED_AUTH_MARKER,
  });
}

export * from "./mitra-professional-facade.mjs";
export {
  EMBEDED_AUTH_MARKER,
  LEX_SOURCE_SHA,
  createMitraProfessionalFacade,
};
