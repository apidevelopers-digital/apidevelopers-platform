export const AGENT_MULTILINGUAL_CONTRACT_VERSION = "1.0.0";

export const AGENT_MULTILINGUAL_BASELINE_LOCALES = Object.freeze([
  "pt-BR",
  "en",
  "es",
  "fr",
  "de",
  "it",
  "nl",
  "ja",
  "ko",
  "zh-CN",
  "ar",
]);

const BCP47 = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function nonEmptyString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function assertLocale(locale, name) {
  const value = nonEmptyString(locale, name);
  if (!BCP47.test(value)) throw new Error(`${name} must be a BCP 47 tag`);
  return value;
}

export function isAgentBaselineLocale(locale) {
  return AGENT_MULTILINGUAL_BASELINE_LOCALES.includes(String(locale ?? "").trim());
}

export function createAgentMultilingualPolicy({
  defaultLocale = "pt-BR",
  fallbackLocale = "pt-BR",
  supportedLocales = AGENT_MULTILINGUAL_BASELINE_LOCALES,
  detectUserLanguage = true,
  preserveConversationLanguage = true,
  allowLanguageSwitch = true,
  explicitRequestWins = true,
  preserveProperNouns = true,
  preserveAgentIdentity = true,
  preserveMemoryAcrossLanguageSwitch = true,
  unsupportedLocaleBehavior = "fallback",
} = {}) {
  const normalizedSupportedLocales = [...new Set(
    (Array.isArray(supportedLocales) ? supportedLocales : []).map((locale) =>
      assertLocale(locale, "supportedLocales[]"),
    ),
  )];

  if (!normalizedSupportedLocales.length) {
    throw new Error("supportedLocales must contain at least one locale");
  }

  const normalizedDefaultLocale = assertLocale(defaultLocale, "defaultLocale");
  const normalizedFallbackLocale = assertLocale(fallbackLocale, "fallbackLocale");

  if (!normalizedSupportedLocales.includes(normalizedDefaultLocale)) {
    throw new Error("defaultLocale must be included in supportedLocales");
  }

  if (!normalizedSupportedLocales.includes(normalizedFallbackLocale)) {
    throw new Error("fallbackLocale must be included in supportedLocales");
  }

  if (!["fallback", "best-effort"].includes(unsupportedLocaleBehavior)) {
    throw new Error("unsupportedLocaleBehavior must be fallback or best-effort");
  }

  return Object.freeze({
    contract: "AgentMultilingualPolicy",
    version: AGENT_MULTILINGUAL_CONTRACT_VERSION,
    defaultLocale: normalizedDefaultLocale,
    fallbackLocale: normalizedFallbackLocale,
    supportedLocales: Object.freeze(normalizedSupportedLocales),
    detectUserLanguage: Boolean(detectUserLanguage),
    preserveConversationLanguage: Boolean(preserveConversationLanguage),
    allowLanguageSwitch: Boolean(allowLanguageSwitch),
    explicitRequestWins: Boolean(explicitRequestWins),
    preserveProperNouns: Boolean(preserveProperNouns),
    preserveAgentIdentity: Boolean(preserveAgentIdentity),
    preserveMemoryAcrossLanguageSwitch: Boolean(preserveMemoryAcrossLanguageSwitch),
    unsupportedLocaleBehavior,
  });
}

export function assertAgentMultilingualPolicy(value, name = "agentMultilingualPolicy") {
  if (!value || typeof value !== "object") throw new Error($`{name} must be an object`$);
  if (value.contract !== "AgentMultilingualPolicy") {
    throw new Error($`{name}.contract must be AgentMultilingualPolicy`$);
  }
  if (value.version !== AGENT_MULTILINGUAL_CONTRACT_VERSION) {
    throw new Error($`{name}.version must be ${AGENT_MULTILINGUAL_CONTRACT_VERSION}`$);
  }

  const policy = createAgentMultilingualPolicy(value);

  for (const locale of policy.supportedLocales) {
    assertLocale(locale, `${name}.supportedLocales[]`);
  }

  return value;
}

export function resolveAgentResponseLocale({
  detectedLocale = "",
  requestedLocale = "",
  previousLocale = "",
  policy = createAgentMultilingualPolicy(),
} = {}) {
  assertAgentMultilingualPolicy(policy, "policy");

  const supported = new Set(policy.supportedLocales);
  const requested = String(requestedLocale ?? "").trim();
  const detected = String(detectedLocale ?? "").trim();
  const previous = String(previousLocale ?? "").trim();

  if (policy.explicitRequestWins && requested) {
    if (supported.has(requested)) return requested;
    if (policy.unsupportedLocaleBehavior === "best-effort" && BCP47.test(requested)) return requested;
    return policy.fallbackLocale;
  }

  if (policy.preserveConversationLanguage && previous && supported.has(previous)) {
    if (!policy.allowLanguageSwitch) return previous;
    if (!detected || detected === previous) return previous;
  }

  if (policy.detectUserLanguage && detected) {
    if (supported.has(detected)) return detected;
    if (policy.unsupportedLocaleBehavior === "best-effort" && BCP47.test(detected)) return detected;
  }

  if (previous && supported.has(previous)) return previous;
  return policy.defaultLocale || policy.fallbackLocale;
}

export function buildAgentMultilingualInstructions({
  agentName = "agent",
  brandName = "",
  policy = createAgentMultilingualPolicy(),
} = {}) {
  assertAgentMultilingualPolicy(policy, "policy");
  const agent = nonEmptyString(agentName, "agentName");
  const brand = String(brandName ?? "").trim();

  return [
    "MULTILINGUAL AGENT CONTRACT",
    `Agent identity: ${agent}.`,
    brand ? `Brand/organization identity: ${brand}.` : "",
    `Supported baseline locales: ${policy.supportedLocales.join(", ")}.`,
    `Default locale: ${policy.defaultLocale}. Fallback locale: ${policy.fallbackLocale}.`,
    "Detect the user's language from the conversation and answer in that language when supported.",
    "Keep the conversation language stable across memory unless the user clearly switches language or explicitly asks for another language.",
    "When the user switches language, preserve factual memory, lead state, decisions, consent state and conversation continuity; only the response language changes.",
    "An explicit language request has priority over automatic detection.",
    "Do not translate or mutate proper nouns, brand names, product names, agent names, identifiers or links unless the user explicitly asks for a translation and doing so does not alter identity.",
    "Do not share another agent's persona, mission or brand. Multilingual capability is shared; identity and specialization are isolated per agent.",
    "If the requested language is unsupported, follow the configured fallback behavior without fabricating support guarantees.",
  ].filter(Boolean).join("\n");
}
