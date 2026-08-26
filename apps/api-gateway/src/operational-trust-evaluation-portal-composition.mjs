import { createGlobalTrustEvaluationApprovedOnboardingService } from "./global-trust-evaluation-approved-onboarding.mjs";
import { createGlobalTrustEvaluationPortalHttpHandler } from "./global-trust-evaluation-portal-http.mjs";
import { createGlobalTrustEvaluationPortalInbox } from "./global-trust-evaluation-portal-inbox.mjs";
import { createGlobalTrustEvaluationPortalSessionService } from "./global-trust-evaluation-portal-session.mjs";
import { createGlobalTrustFaceLabHttpHandler } from "./global-trust-face-lab-http.mjs";
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

function wrapTdtpApp({ app, handler }) {
  if (
    typeof app?.handleRequest !== "function" ||
    typeof handler?.handleRequest !== "function"
  ) {
    throw new TypeError("app and handler must expose handleRequest()");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const response = await handler.handleRequest(request);
      if (response !== null) return response;
      return app.handleRequest(request);
    },
    ...(app.metrics ? { metrics: app.metrics } : {}),
  });
}

export function attachOperationalTrustEvaluationPortal({
  gateway: gatewayInput,
  clock,
  sessionTtlMs,
  faceLabLiveRuntime = null,
  env = process.env,
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
  const faceLabHttp = createGlobalTrustFaceLabHttpHandler({
    portalSession: evaluationPortalSession,
    liveRuntime: faceLabLiveRuntime,
    env,
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

  const portalApp = wrapTdtpApp({
    app: gateway.app,
    handler: evaluationPortalHttp,
  });
  const app = wrapHttpApp({
    app: portalApp,
    handler: faceLabHttp,
  });

  return Object.freeze({
    ...gateway,
    evaluationPortalSession,
    evaluationPortalInbox,
    evaluationPortalHttp,
    faceLabHttp,
    faceLabLiveRuntime,
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
    ...(options.faceLabLiveRuntime ? { faceLabLiveRuntime: options.faceLabLiveRuntime } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
}
