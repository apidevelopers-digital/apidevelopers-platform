import { createCommercialJourney } from "@apidevelopers/commercial-journey-core";
import { createUserService } from "@apidevelopers/user-core";
import {
  createEntitlement,
  createMemoryPlanRepository,
  createMeter,
  createPlanService,
  createPlanVersion,
  createProductVersion,
} from "@apidevelopers/plan-core";
import { createCheckoutService } from "@apidevelopers/checkout-core";
import { createSubscriptionService } from "@apidevelopers/subscription-core";
import { createTenantService } from "@apidevelopers/tenant-core";
import { createProjectService } from "@apidevelopers/project-core";
import { createProvisioningService } from "@apidevelopers/provisioning-core";
import {
  createApiKeyRecord,
  generateApiKey,
  toPublicApiKeyRecord,
} from "@apidevelopers/apikey-core";
import { createGatewayService } from "@apidevelopers/gateway-core";

const T0 = "2026-07-21T00:00:00.000Z";
const T1 = "2026-08-21T00:00:00.000Z";

function createClock() {
  let tick = 0;
  return () => new Date(Date.parse(T0) + tick++ * 1000).toISOString();
}

function createIdFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function ok(value) {
  return { ok: true, value };
}

function createCatalog() {
  const product = createProductVersion({
    id: "platform-core",
    name: "API Developers Platform Core",
    status: "READY_TO_SELL",
    version: 1,
    apiIds: ["identity", "projects", "apikeys"],
    planIds: ["developer"],
    provisioningProfile: "platform-core-v1",
    billingProfile: "subscription-with-usage-v1",
    effectiveFrom: "2026-07-01T00:00:00.000Z",
  });

  const plan = createPlanVersion({
    id: "developer",
    productId: product.id,
    productVersion: product.version,
    name: "Developer",
    status: "ACTIVE",
    version: 1,
    currency: "BRL",
    unitAmount: 9900,
    priceReference: "PRICE_APPROVED_2026_01",
    billingInterval: "month",
    entitlements: [createEntitlement({ key: "projects.max", value: 3 })],
    meters: [
      createMeter({
        key: "api.requests",
        unit: "request",
        period: "month",
        includedUnits: 10000,
        overagePriceReference: "OVERAGE_APPROVED_2026_01",
      }),
    ],
    upgradeTo: [],
    downgradeTo: [],
    effectiveFrom: "2026-07-01T00:00:00.000Z",
  });

  return { product, plan };
}

export function createCommercialJourneyMemoryRuntime({ enabled = false } = {}) {
  const clock = createClock();
  const catalog = createCatalog();

  const userService = createUserService({
    idFactory: createIdFactory("user"),
    clock,
  });

  const planService = createPlanService({
    repository: createMemoryPlanRepository({
      initialProducts: [catalog.product],
      initialPlans: [catalog.plan],
    }),
    clock,
  });

  const checkoutService = createCheckoutService({
    idFactory: createIdFactory("checkout-snapshot"),
    clock,
  });

  const tenantService = createTenantService({
    idFactory: createIdFactory("tenant"),
    clock,
  });

  const projectService = createProjectService({
    idFactory: createIdFactory("project"),
    clock,
    assertTenantOperational: (tenantId) => tenantService.getTenant(tenantId),
  });

  const subscriptionService = createSubscriptionService({
    idFactory: createIdFactory("subscription-snapshot"),
    clock,
  });

  const provisioningService = createProvisioningService({
    idFactory: createIdFactory("provisioning-snapshot"),
    actionIdFactory: createIdFactory("compensation"),
    clock,
  });

  const gatewayService = createGatewayService({
    entitlementService: {
      assertAccess: () => ({
        allowed: true,
        snapshot: { id: "entitlement-1", planId: "developer" },
      }),
    },
    limitsService: {
      evaluate: () => ({
        assignment: { id: "assignment-1", planId: "developer" },
        rule: { id: "api-requests-limit" },
        window: { from: T0, to: T1 },
        decision: { allowed: true, action: "allow" },
      }),
    },
    usageService: {
      recordUsage: () => ({ event: { id: "usage-1" }, appended: true }),
    },
    idFactory: createIdFactory("gateway-snapshot"),
    clock,
  });

  const adapters = {
    registerCustomer({ input }) {
      const registered = userService.registerUser({
        email: input.email,
        displayName: input.displayName,
      });
      return ok(userService.verifyEmail(registered.user.id).user);
    },

    selectPlan({ input }) {
      const selection = planService.getSellablePlan(input.planId ?? "developer");
      return ok({
        ...selection,
        plan: Object.freeze({
          ...selection.plan,
          productVersion: selection.product.version,
        }),
      });
    },

    createCheckoutSession(context) {
      const { product, plan } = context.selectPlan;
      return ok(checkoutService.createSession({
        checkoutId: "checkout-1",
        accountId: context.registerCustomer.id,
        product,
        plan,
        provider: "memory-provider",
        providerSessionId: "memory-session-1",
        redirectUrl: "https://example.invalid/checkout/1",
        idempotencyKey: "commercial-intent-1",
        sourceEventId: "checkout-create-1",
        expiresAt: T1,
      }));
    },

    confirmPayment(context) {
      const snapshot = context.createCheckoutSession.snapshot;
      return ok(checkoutService.completeSession({
        checkoutId: snapshot.checkoutId,
        sourceEventId: "payment-1",
        providerSessionId: snapshot.providerSessionId,
        paymentReference: "payment-1",
        amount: context.input.paymentAmount ?? snapshot.amount,
        currency: context.input.paymentCurrency ?? snapshot.currency,
        completedAt: clock(),
      }));
    },

    activateSubscription(context) {
      const { product, plan } = context.selectPlan;
      subscriptionService.createPending({
        subscriptionId: "subscription-1",
        tenantId: "tenant-1",
        product,
        plan,
        sourceEventId: "checkout-1",
        currentPeriodStart: T0,
        currentPeriodEnd: T1,
      });
      return ok(subscriptionService.activate({
        subscriptionId: "subscription-1",
        sourceEventId: "payment-1",
        activatedAt: clock(),
      }));
    },

    provisionWorkspace(context) {
      const user = context.registerCustomer;
      const subscription = context.activateSubscription.snapshot;
      const provisioningId = "provisioning-1";

      provisioningService.requestProvisioning({
        provisioningId,
        subscription,
        accountId: user.id,
        ownerUserId: user.id,
        tenantName: context.input.tenantName ?? "Acme",
        tenantSlug: context.input.tenantSlug ?? "acme",
        projectName: context.input.projectName ?? "Production",
        projectSlug: context.input.projectSlug ?? "production",
        sourceEventId: "subscription-activated-1",
      });
      provisioningService.startProvisioning({
        provisioningId,
        sourceEventId: "provisioning-start-1",
      });

      const tenant = tenantService.provisionTenant({
        name: context.input.tenantName ?? "Acme",
        ownerUserId: user.id,
      }).tenant;
      tenantService.activateTenant(tenant.id);
      provisioningService.recordTenantProvisioned({
        provisioningId,
        sourceEventId: "tenant-provisioned-1",
        tenantId: tenant.id,
      });

      const project = projectService.createProject({
        tenantId: tenant.id,
        name: context.input.projectName ?? "Production",
      }).project;
      projectService.activateProject(project.id);
      provisioningService.recordProjectProvisioned({
        provisioningId,
        sourceEventId: "project-provisioned-1",
        projectId: project.id,
      });

      return ok({ provisioningId, tenant, project });
    },

    issueApiKey(context) {
      const apiKey = generateApiKey({
        randomBytesFactory: () => Buffer.alloc(24, 7),
      });
      const publicRecord = toPublicApiKeyRecord(createApiKeyRecord({
        apiKey,
        id: "apikey-1",
        clock,
      }));

      const recorded = provisioningService.recordApiKeyIssued({
        provisioningId: context.provisionWorkspace.provisioningId,
        sourceEventId: "apikey-issued-1",
        apiKeyId: publicRecord.id,
        prefix: publicRecord.prefix,
      });
      const completed = provisioningService.completeProvisioning({
        provisioningId: context.provisionWorkspace.provisioningId,
        sourceEventId: "provisioning-complete-1",
      });

      return ok({
        record: publicRecord,
        recorded: recorded.snapshot,
        provisioning: completed.snapshot,
      });
    },

    invokeFirstRequest(context) {
      const principal = {
        apiKeyId: context.issueApiKey.record.id,
        apiKeyPrefix: context.issueApiKey.record.prefix,
        apiKeyStatus: context.issueApiKey.record.status,
        tenantId: context.provisionWorkspace.tenant.id,
        projectId: context.provisionWorkspace.project.id,
        subscriptionId: context.activateSubscription.snapshot.subscriptionId,
      };

      const authorized = gatewayService.authorize({
        requestId: "request-1",
        idempotencyKey: "gateway-request-1",
        principal,
        apiId: "identity",
        operation: "me.read",
        entitlementKey: "identity.read",
        quantity: 1,
        requestedAt: clock(),
      });

      const completed = gatewayService.complete({
        requestId: "request-1",
        idempotencyKey: "usage-for-request-1",
        occurredAt: clock(),
        metadata: { upstreamStatus: 200 },
      });

      return ok({
        statusCode: 200,
        authorization: authorized.snapshot,
        completion: completed.snapshot,
      });
    },
  };

  const journey = createCommercialJourney({ adapters, enabled });

  return Object.freeze({
    execute: journey.execute,
    enabled: journey.enabled,
    activationMode: journey.activationMode,
    liveAllowed: false,
    deployAllowed: false,
    externalPublicationAllowed: false,
  });
}
