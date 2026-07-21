export class CommercialJourneyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CommercialJourneyError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

const STEPS = Object.freeze([
  "registerCustomer",
  "selectPlan",
  "createCheckoutSession",
  "confirmPayment",
  "activateSubscription",
  "provisionWorkspace",
  "issueApiKey",
  "invokeFirstRequest",
]);

function fail(code, message, details = {}) {
  throw new CommercialJourneyError(code, message, details);
}

function assertAdapter(adapters, name) {
  if (typeof adapters?.[name] !== "function") {
    fail("COMMERCIAL_JOURNEY_ADAPTER_MISSING", `adapter ${name} is required`, { name });
  }
}

function freeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
}

export function createCommercialJourney({ adapters, enabled = false } = {}) {
  for (const step of STEPS) assertAdapter(adapters, step);

  async function execute(input = {}) {
    if (!enabled) {
      fail(
        "COMMERCIAL_JOURNEY_DISABLED",
        "commercial journey is disabled by default and requires explicit injected activation",
      );
    }

    const context = { input: structuredClone(input), events: [] };

    for (const step of STEPS) {
      const result = await adapters[step](freeze(structuredClone(context)));
      if (!result || typeof result !== "object" || result.ok !== true) {
        fail("COMMERCIAL_JOURNEY_STEP_FAILED", `step ${step} failed closed`, {
          step,
          result: result ?? null,
        });
      }
      context[step] = structuredClone(result.value ?? {});
      context.events.push(Object.freeze({ step, status: "completed" }));
    }

    return freeze({
      status: "completed",
      activationMode: "injected_test_only",
      liveAllowed: false,
      deployAllowed: false,
      externalPublicationAllowed: false,
      steps: [...STEPS],
      customer: context.registerCustomer,
      plan: context.selectPlan,
      checkout: context.createCheckoutSession,
      payment: context.confirmPayment,
      subscription: context.activateSubscription,
      workspace: context.provisionWorkspace,
      apiKey: context.issueApiKey,
      firstRequest: context.invokeFirstRequest,
      events: context.events,
    });
  }

  return Object.freeze({
    execute,
    enabled,
    activationMode: enabled ? "injected_test_only" : "disabled",
    liveAllowed: false,
    deployAllowed: false,
    externalPublicationAllowed: false,
    mutationScope: "commercial_orchestration_only",
    canonicalMutationAllowed: false,
    steps: STEPS,
  });
}
