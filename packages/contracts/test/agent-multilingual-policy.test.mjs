import test from "node:test";
import assert from "node:assert/strict";

import {
  AGENT_MULTILINGUAL_BASELINE_LOCALES,
  createAgentMultilingualPolicy,
  assertAgentMultilingualPolicy,
  resolveAgentResponseLocale,
  buildAgentMultilingualInstructions,
} from "../src/agent-multilingual-policy.mjs";

test("agent multilingual baseline has the 11 institutional locales", () => {
  assert.deepEqual(AGENT_MULTILINGUAL_BASELINE_LOCALES, [
    "pt-BR", "en", "es", "fr", "de", "it", "nl", "ja", "ko", "zh-CN", "ar",
  ]);
});

test("creates a channel-neutral multilingual policy", () => {
  const policy = createAgentMultilingualPolicy();
  assert.equal(policy.contract, "AgentMultilingualPolicy");
  assert.equal(policy.defaultLocale, "pt-BR");
  assert.equal(policy.preserveMemoryAcrossLanguageSwitch, true);
  assert.equal(policy.preserveAgentIdentity, true);
  assertAgentMultilingualPolicy(policy);
});

test("explicit user language request wins", () => {
  const policy = createAgentMultilingualPolicy();
  assert.equal(resolveAgentResponseLocale({
    detectedLocale: "en",
    previousLocale: "pt-BR",
    requestedLocale: "es",
    policy,
  }), "es");
});

test("conversation language persists when no new language is detected", () => {
  const policy = createAgentMultilingualPolicy();
  assert.equal(resolveAgentResponseLocale({
    previousLocale: "fr",
    policy,
  }), "fr");
});

test("detected supported language can switch the conversation language", () => {
  const policy = createAgentMultilingualPolicy();
  assert.equal(resolveAgentResponseLocale({
    previousLocale: "pt-BR",
    detectedLocale: "de",
    policy,
  }), "de");
});

test("unsupported language falls back safely", () => {
  const policy = createAgentMultilingualPolicy();
  assert.equal(resolveAgentResponseLocale({
    requestedLocale: "ru",
    policy,
  }), "pt-BR");
});

test("instructions keep multilingual capability shared but personas isolated", () => {
  const text = buildAgentMultilingualInstructions({
    agentName: "NEXUS",
    brandName: "API Developers.digital",
  });

  assert.match(text, /Supported baseline locales:/);
  assert.match(text, /preserve factual memory/i);
  assert.match(text, /proper nouns/i);
  assert.match(text, /Do not share another agent's persona/i);
  assert.match(text, /Multilingual capability is shared; identity and specialization are isolated per agent/);
});
