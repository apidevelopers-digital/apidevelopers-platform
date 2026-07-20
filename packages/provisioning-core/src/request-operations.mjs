import {
  ProvisioningDomainError,
  deepFreeze,
  requireText,
} from "./common.mjs";
import { createProvisioningSnapshot } from "./model.mjs";

export function createRequestOperations(ctx) {
  const { repository, idFactory, now, duplicate } = ctx;

  return {
    requestProvisioning({
      provisioningId,
      subscription,
      accountId,
      ownerUserId,
      tenantName,
      tenantSlug,
      projectName,
      projectSlug,
      sourceEventId,
      metadata = {},
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      if (subscription?.status !== "active") {
        throw new ProvisioningDomainError(
          "subscription_not_active",
          "provisioning requires an active subscription",
          { status: subscription?.status ?? null },
        );
      }

      const existing = repository.getCurrentBySubscription(
        subscription.subscriptionId,
      );
      if (existing) {
        const sameIntent =
          existing.accountId === accountId &&
          existing.ownerUserId === ownerUserId &&
          existing.productId === subscription.productId &&
          existing.productVersion === subscription.productVersion &&
          existing.planId === subscription.planId &&
          existing.planVersion === subscription.planVersion;
        if (!sameIntent) {
          throw new ProvisioningDomainError(
            "subscription_provisioning_conflict",
            "subscription is already bound to another provisioning intent",
          );
        }
        return deepFreeze({
          snapshot: existing,
          appended: false,
          duplicateOf: existing.snapshotId,
          events: [],
        });
      }

      const createdAt = now();
      const snapshot = createProvisioningSnapshot({
        snapshotId: requireText(idFactory(), "idFactory result"),
        provisioningId,
        revision: 1,
        subscriptionId: subscription.subscriptionId,
        accountId,
        ownerUserId,
        productId: subscription.productId,
        productVersion: subscription.productVersion,
        planId: subscription.planId,
        planVersion: subscription.planVersion,
        status: "requested",
        attempt: 0,
        currentStep: "tenant",
        tenant: {
          status: "pending",
          id: null,
          name: tenantName,
          slug: tenantSlug ?? tenantName,
        },
        project: {
          status: "pending",
          id: null,
          name: projectName,
          slug: projectSlug ?? projectName,
        },
        apikey: {
          status: "pending",
          id: null,
          prefix: null,
        },
        failure: null,
        compensation: [],
        sourceEventId,
        previousSnapshotId: null,
        createdAt,
        metadata,
      });
      const stored = repository.append(snapshot);
      return deepFreeze({
        ...stored,
        events: stored.appended
          ? [{
              type: "provisioning.requested",
              provisioningId: snapshot.provisioningId,
              subscriptionId: snapshot.subscriptionId,
              accountId: snapshot.accountId,
              occurredAt: createdAt,
              data: {
                productId: snapshot.productId,
                productVersion: snapshot.productVersion,
                planId: snapshot.planId,
                planVersion: snapshot.planVersion,
              },
            }]
          : [],
      });
    },

    startProvisioning({ provisioningId, sourceEventId }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = ctx.current(provisioningId);
      ctx.mutable(previous);
      if (previous.status !== "requested") {
        throw new ProvisioningDomainError(
          "invalid_provisioning_transition",
          "only requested provisioning can start",
          { status: previous.status },
        );
      }
      return ctx.append(
        previous,
        sourceEventId,
        {
          status: "running",
          attempt: previous.attempt + 1,
          currentStep: "tenant",
        },
        "provisioning.started",
        { attempt: previous.attempt + 1 },
      );
    },
  };
}
