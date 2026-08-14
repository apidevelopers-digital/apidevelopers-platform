import { createGlobalTrustEvaluationApprovedOnboardingService } from "./global-trust-evaluation-approved-onboarding.mjs";
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
    !gateway.audit
  ) {
    throw new TypeError(
      "gateway must expose store, audit and Evaluation tenant/key services",
    );
  }
  return gateway;
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

  return Object.freeze({
    ...gateway,
    evaluationPortalSession,
    evaluationPortalInbox,
    evaluationApprovedOnboarding,
    evaluationDeliveryChannel: "in_product_portal",
    evaluationExternalEnvelopeEgress: false,
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
