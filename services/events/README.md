# AP Events

Status: Foundation v1
Owner: API Developers.digital
Maturity: L1 -> L2

## Mission

Provide a canonical, versioned event bus for communication between all domains of the platform.

## Responsibilities

- define canonical event envelopes;
- support versioned event contracts;
- enable asynchronous integration;
- preserve correlation, causation and traceability;
- integrate with AP Audit and AP Observability.

## Out of scope

- business rules;
- provider-specific messaging;
- direct point-to-point integrations.

## Canonical fields

- event_id
- event_type
- event_version
- tenant_id
- request_id
- correlation_id
- causation_id
- occurred_at
- producer
- data
