import { createGlobalTrustEvaluationApprovedOnboardingService } from "./global-trust-evaluation-approved-onboarding.mjs";
import { createGlobalTrustEvaluationPortalHttpHandler } from "./global-trust-evaluation-portal-http.mjs";
import { createGlobalTrustEvaluationPortalInbox } from "./global-trust-evaluation-portal-inbox.mjs";
import { createGlobalTrustEvaluationPortalSessionService } from "./global-trust-evaluation-portal-session.mjs";
import { createOperationalTrustEvaluationGateway } from "./operational-trust-evaluation-composition.mjs";

function requireGateway(gateway) {
  if (
    !gateway ||
    typeof gateway !== "object" ||
    !gateway.store ||
    typeof gateway.store.read !== "function" ||
    typeof gateway.store.transaction !== "function" ||
    !gateway.evaluationTenantService ||
    !gateway.evaluationRecipientKeyProof ||
    !gateway.evaluationRecipientKeyEnrollment ||
    !gateway.audit ||
    typeof gateway.app?.handleRequest !== "function"
  ) {
    throw new TypeError(
      "gateway must expose app, store, audit and Evaluation tenant/key services",
    );
  }
  return gateway;
}

function wrapPortalApp({ app, portalHttp }) {
  if (
    typeof app?.handleRequest !== "function" ||
    typeof portalHttp?.handleRequest !== "function"
  ) {
    throw new TypeError("app and portalHttp must expose handleRequest()");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const portalResponse = await portalHttp.handleRequest(request);
      if (portalResponse !== null) return portalResponse;
      return app.handleRequest(request);
    },
    ...(app.metrics ? { metrics: app.metrics } : {}),
  });
}

export function attachOperationalTrustEvaluationPortal({
  gateway: gatewayInput,
  clock,
  sessionTtlMs,
} = {}) {
  const gateway = requireGateway(gatewayInput);

  const evaluationPortalSession = createGlobalTrustEvaluationPortalSessionService({
    store: gateway.store,
    recipientKeyProofService: gateway.evaluationRecipientKeyProof,
    ...(clock ? { clock } : {}),
    ...(sessionTtlMs === undefined ? {} : { sessionTtlMs }),
  });
  const evaluationPortalInbox = createGlobalTrustEvaluationPortalInbox({
    store: gateway.store,
    ...(clock ? { clock } : {}),
  });
  const evaluationPortalHttp = createGlobalTrustEvaluationPortalHttpHandler({
    portalSession: evaluationPortalSession,
    portalInbox: evaluationPortalInbox,
  });

  const evaluationApprovedOnboarding =
    createGlobalTrustEvaluationApprovedOnboardingService({
      evaluationTenantService: gateway.evaluationTenantService,
      audit: gateway.audit,
      recipientKeyEnrollmentService: gateway.evaluationRecipientKeyEnrollment,
      deliverEnvelope: (envelope, context = {}) =>
        evaluationPortalInbox.deliver({
          organizationId: context.organizationId,
          enrollmentId: context.enrollmentId,
          envelope,
        }),
    });

  const app = wrapPortalApp({
    app: gateway.app,
    portalHttp: evaluationPortalHttp,
  });

  return Object.freeze({
    ...gateway,
    evaluationPortalSession,
    evaluationPortalInbox,
    evaluationPortalHttp,
    evaluationApprovedOnboarding,
    evaluationDeliveryChannel: "in_product_portal",
    evaluationExternalEnvelopeEgress: false,
    app,
  });
}

export function createOperationalTrustEvaluationPortalGateway(options = {}) {
  if (options.deliverEvaluationEnvelope || options.credentialHandoff) {
    throw new TypeError(
      "portal gateway owns Evaluation credential delivery; external/legacy handoff must not be supplied",
    );
  }
  const gateway = createOperationalTrustEvaluationGateway({
    ...options,
    deliverEvaluationEnvelope: undefined,
    credentialHandoff: undefined,
  });
  return attachOperationalTrustEvaluationPortal({
    gateway,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.portalSessionTtlMs === undefined
      ? {}
      : { sessionTtlMs: options.portalSessionTtlMs }),
  });
}
