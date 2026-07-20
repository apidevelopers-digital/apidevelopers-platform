import {
  CheckoutDomainError,
  createCheckoutSnapshot,
  deepFreeze,
  requireIso,
  requireText,
} from "./model.mjs";
import { validateCatalogSelection } from "./service-context.mjs";

export function createSessionOperations(ctx) {
  const {
    repository,
    assertAccountOperational,
    now,
    current,
    duplicate,
    mutable,
    append,
    idFactory,
  } = ctx;

  return {
    createSession({
      checkoutId,
      accountId,
      product,
      plan,
      provider,
      providerSessionId,
      redirectUrl,
      idempotencyKey,
      sourceEventId,
      expiresAt,
      metadata = {},
    }) {
      const repeatedEvent = duplicate(sourceEventId);
      if (repeatedEvent) return repeatedEvent;
      const existingIntent = repository.getByIdempotencyKey(idempotencyKey);
      if (existingIntent) {
        const selection = validateCatalogSelection(product, plan);
        const sameIntent = (
          existingIntent.accountId === accountId &&
          existingIntent.productId === selection.productId &&
          existingIntent.productVersion === selection.productVersion &&
          existingIntent.planId === selection.planId &&
          existingIntent.planVersion === selection.planVersion &&
          existingIntent.amount === selection.amount &&
          existingIntent.currency === selection.currency &&
          existingIntent.provider === provider
        );
        if (!sameIntent) {
          throw new CheckoutDomainError(
            "idempotency_key_conflict",
            "idempotency key is already bound to another checkout intent",
          );
        }
        return deepFreeze({
          snapshot: existingIntent,
          appended: false,
          duplicateOf: existingIntent.snapshotId,
          events: [],
        });
      }

      const normalizedAccountId = requireText(accountId, "accountId");
      assertAccountOperational(normalizedAccountId);
      const selection = validateCatalogSelection(product, plan);
      const createdAt = now();
      const snapshot = createCheckoutSnapshot({
        snapshotId: requireText(idFactory(), "idFactory result"),
        checkoutId: requireText(checkoutId, "checkoutId"),
        revision: 1,
        accountId: normalizedAccountId,
        ...selection,
        status: "pending",
        provider,
        providerSessionId,
        redirectUrl,
        idempotencyKey,
        paymentReference: null,
        completedAt: null,
        cancelledAt: null,
        endedAt: null,
        expiresAt,
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
              type: "checkout.session.created",
              checkoutId: snapshot.checkoutId,
              accountId: snapshot.accountId,
              occurredAt: createdAt,
              data: {
                productId: snapshot.productId,
                productVersion: snapshot.productVersion,
                planId: snapshot.planId,
                planVersion: snapshot.planVersion,
                amount: snapshot.amount,
                currency: snapshot.currency,
                provider: snapshot.provider,
                expiresAt: snapshot.expiresAt,
              },
            }]
          : [],
      });
    },

    completeSession({
      checkoutId,
      sourceEventId,
      providerSessionId,
      paymentReference,
      amount,
      currency,
      completedAt = now(),
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(checkoutId);
      mutable(previous);
      if (previous.status !== "pending") {
        throw new CheckoutDomainError(
          "invalid_checkout_transition",
          "only pending checkout can complete",
          { status: previous.status },
        );
      }
      if (requireText(providerSessionId, "providerSessionId") !== previous.providerSessionId) {
        throw new CheckoutDomainError("provider_session_mismatch", "provider session does not match checkout");
      }
      if (amount !== previous.amount) {
        throw new CheckoutDomainError("payment_amount_mismatch", "confirmed payment amount does not match checkout");
      }
      if (requireText(currency, "currency").toUpperCase() !== previous.currency) {
        throw new CheckoutDomainError("payment_currency_mismatch", "confirmed payment currency does not match checkout");
      }
      const normalizedCompletedAt = requireIso(completedAt, "completedAt");
      if (Date.parse(normalizedCompletedAt) > Date.parse(previous.expiresAt)) {
        throw new CheckoutDomainError("checkout_expired", "checkout cannot complete after expiry");
      }
      return append(
        previous,
        sourceEventId,
        {
          status: "completed",
          paymentReference,
          completedAt: normalizedCompletedAt,
          cancelledAt: null,
          endedAt: null,
        },
        "checkout.session.completed",
        {
          productId: previous.productId,
          productVersion: previous.productVersion,
          planId: previous.planId,
          planVersion: previous.planVersion,
          amount: previous.amount,
          currency: previous.currency,
          provider: previous.provider,
          providerSessionId: previous.providerSessionId,
          paymentReference: requireText(paymentReference, "paymentReference"),
          confirmed: true,
        },
      );
    },

    expireSession({ checkoutId, sourceEventId, at = now() }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(checkoutId);
      mutable(previous);
      const normalizedAt = requireIso(at, "at");
      if (Date.parse(normalizedAt) < Date.parse(previous.expiresAt)) {
        throw new CheckoutDomainError("checkout_not_expired", "checkout expiry has not been reached");
      }
      return append(
        previous,
        sourceEventId,
        { status: "expired", endedAt: normalizedAt },
        "checkout.session.expired",
        { expiresAt: previous.expiresAt },
      );
    },

    cancelSession({ checkoutId, sourceEventId, reason = "requested", at = now() }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(checkoutId);
      mutable(previous);
      const cancelledAt = requireIso(at, "at");
      return append(
        previous,
        sourceEventId,
        {
          status: "cancelled",
          cancelledAt,
          endedAt: cancelledAt,
        },
        "checkout.session.cancelled",
        { reason: requireText(reason, "reason") },
      );
    },
  };
}
