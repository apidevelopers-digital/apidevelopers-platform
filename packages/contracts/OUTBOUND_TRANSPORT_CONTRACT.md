# Outbound Transport Contract

This package defines the canonical boundary for a future outbound transport adapter.

It does **not** implement a provider, endpoint, credential, queue, message send, deployment, publication or external side effect.

## Invariants

- preview and execute are separate request modes;
- destination and payload are referenced only by opaque identifiers;
- raw phone numbers, e-mail addresses and inline payloads are not contract fields;
- execute mode requires evidence;
- a fresh human approval is bound to request, tenant, destination, content hash and idempotency key;
- a fresh policy authorization is bound to the same values;
- the exact confirmation `EXECUTE_APPROVED_OUTBOUND_TRANSPORT` is required;
- automatic send, cross-tenant access and replay remain blocked;
- the execution handoff only declares readiness and never performs transport.

A real adapter remains out of scope until separately designed, reviewed, validated and explicitly approved.
