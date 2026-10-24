# SaaS Billing Foundation v1

Status: draft implementation; no provider live configured.

This package introduces the shared billing boundary between product pricing and the existing SaaS lifecycle.

Principles:
- provider-neutral core; adapters own provider-specific signatures and payloads;
- money sent to providers uses integer `amountMinor` plus ISO-4217 style currency codes;
- checkout amount is resolved server-side from an immutable catalog, never accepted from the browser;
- raw webhook payload is verified by the provider adapter before any subscription mutation;
- provider events are idempotent by provider + event ID;
- payment success can activate/recover a SaaS `Subscription`; failure can mark an active subscription `past_due`; cancellation maps to `cancelled`;
- no PAN, CVV, card data, API key, bearer token, or provider secret is persisted by this package;
- `provider.mode` is explicit (`test` or `live`) and recorded with checkout/event evidence;
- entitlement and provisioning remain downstream of the existing SaaS runtime/access gates.

Not included in this branch:
- selection/configuration of a real payment provider;
- provider credentials or production webhooks;
- live checkout activation;
- product-specific prices for uni.co;
- tax/legal configuration by jurisdiction;
- merge or deployment.

Before live activation, the chosen adapter must be tested in provider sandbox/test mode and its signed webhook must be the only path that promotes paid subscriptions.
