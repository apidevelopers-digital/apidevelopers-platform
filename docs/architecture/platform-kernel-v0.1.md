# Platform Kernel v0.1

**Status:** Draft for implementation  
**Authority:** API Developers Constitution  
**Repository:** `apidevelopers-platform`  
**Branch:** `foundation/global-platform-bootstrap-20260715`

## 1. Purpose

The Platform Kernel provides organization-neutral capabilities, contracts, governance and runtime mechanisms that may be reused by multiple Assets, Solutions and Organizations.

The Kernel shall not contain customer-specific business rules, provider-specific assumptions or implementation details that prevent replacement through explicit contracts and adapters.

## 2. Constitutional boundaries

The Kernel must preserve the following boundaries:

- **Institution** defines identity, Constitution, Canon and Method.
- **Company** creates market value and operates commercially.
- **Platform** provides reusable organization-neutral capabilities.
- **Assets** implement governed capabilities.
- **Solutions** compose Assets for a specific operational or market context.
- **Organizations** consume and configure Solutions and Assets.

No lower layer may redefine a higher layer.

The `uni.` organization is the first strategic client and validation environment. It has no architectural privilege over the Kernel.

## 3. Minimal Kernel capabilities

Platform Kernel v0.1 consists of the following capabilities:

### 3.1 Identity

Responsibilities:

- identify users, services, agents and Organizations;
- issue and validate identities;
- represent roles, permissions and scopes;
- preserve tenant boundaries;
- support revocation and audit.

### 3.2 Registry

Responsibilities:

- register Capabilities, Assets, Solutions and Organizations;
- expose canonical identifiers and lifecycle state;
- preserve ownership and dependency metadata;
- provide queryable inventory;
- prevent duplicate or ambiguous identity.

### 3.3 Guard

Responsibilities:

- classify operational risk;
- enforce approval gates;
- block unauthorized or unsafe execution;
- preserve decision evidence;
- apply policy without embedding Organization-specific rules.

### 3.4 Memory

Responsibilities:

- retain governed institutional and operational context;
- preserve purpose, scope, retention and revocation;
- enforce tenant isolation;
- block secrets and prohibited data;
- provide auditable recall.

### 3.5 Events

Responsibilities:

- define organization-neutral event envelopes;
- support publication, consumption and correlation;
- preserve version compatibility;
- provide retry and delivery semantics;
- enable decoupled Platform behavior.

### 3.6 Evidence

Responsibilities:

- register objective proof of tests, contracts, security, observability, runtime and documentation;
- preserve origin, timestamp, ownership and integrity;
- support promotion and audit decisions;
- prevent unsupported maturity claims.

### 3.7 Promotion

Responsibilities:

- assess lifecycle transitions;
- evaluate required evidence;
- return `approved`, `blocked` or `needs-review`;
- never mutate an Asset automatically;
- preserve assessment history.

### 3.8 Runtime

Responsibilities:

- execute validated plans;
- allow only known actions;
- use dry-run as the default mode;
- record task results;
- generate auditable execution reports.

### 3.9 Observability

Responsibilities:

- expose health, metrics, traces and alerts;
- measure Platform and Asset behavior;
- preserve Organization boundaries;
- support operational diagnosis without disclosing protected data.

### 3.10 Composition

Responsibilities:

- declare which Assets compose a Solution;
- resolve dependencies and compatibility;
- preserve versioned composition;
- prevent Solution-specific behavior from entering the Kernel.

### 3.11 Knowledge

Responsibilities:

- reference Canon, Methods, Policies, Standards and ADRs;
- preserve traceability from implementation to institutional authority;
- make institutional knowledge queryable by people and AI systems.

### 3.12 AI Runtime

Responsibilities:

- orchestrate models, tools, memory and agents;
- remain independent from a single model provider;
- apply Guard, Identity, Evidence and Observability;
- treat AI output as advisory unless explicitly authorized by policy.

## 4. Non-Kernel concerns

The following concerns do not belong in the Kernel:

- rules exclusive to `uni.` or any other Organization;
- provider-specific implementation logic;
- market-specific workflows;
- customer-specific pricing;
- client branding;
- temporary experiments;
- raw credentials or secrets;
- unreviewed automation;
- direct coupling to accounting, legal, messaging or hardware vendors.

Such concerns belong in Assets, adapters, Solutions, Organization configuration or the Lab.

## 5. Capability admission test

A proposed capability may enter the Kernel only when it can answer positively:

1. Is it reusable by multiple Organizations?
2. Is it independent from a single provider?
3. Can it be expressed through explicit contracts?
4. Does it strengthen at least one existing Kernel invariant?
5. Does it preserve tenant isolation?
6. Can it be observed and audited?
7. Can it evolve without redefining the Constitution?
8. Is it inappropriate to implement solely as an Asset or Solution?

A negative answer requires architectural review.

## 6. Kernel invariants

The following invariants are mandatory:

- organization neutrality;
- explicit contracts;
- provider replaceability;
- tenant isolation;
- evidence before promotion;
- dry-run before controlled execution;
- no secrets in source or logs;
- traceable structural decisions;
- reversible operational changes where reasonably possible;
- compatibility with the Constitution.

## 7. Initial Asset mapping

| Kernel capability | Initial Asset candidate |
|---|---|
| Guard | `asset.ap-guard` |
| Memory | `asset.ap-memory` |
| Identity | `asset.ap-identity` |
| Events | `asset.ap-events` |
| Messaging | `asset.ap-whatsapp` |
| Promotion | Promotion Engine v1 |
| Runtime | Factory Runtime V1 |
| Registry | Platform Asset Registry |
| Evidence | Evidence Registry |
| Observability | Pending candidate |
| Composition | Pending candidate |
| Knowledge | Constitution and Canon integration |
| AI Runtime | Pending candidate |

## 8. Implementation order

The recommended implementation sequence is:

1. Registry
2. Evidence
3. Promotion
4. Identity
5. Guard
6. Events
7. Memory
8. Runtime
9. Observability
10. Composition
11. Knowledge
12. AI Runtime

This order may be adjusted by evidence, but not by short-term Organization pressure.

## 9. Definition of Kernel v0.1 complete

Platform Kernel v0.1 is complete when:

- all minimal capabilities have canonical identities;
- Registry can list and query them;
- Evidence can support objective promotion assessments;
- Promotion integrates with Registry and Evidence;
- Identity and Guard enforce Organization boundaries;
- Events provide versioned envelopes;
- Runtime executes validated plans with dry-run by default;
- Observability exposes health and execution evidence;
- `uni.` can consume the Platform without Organization-specific rules entering the Kernel.

## 10. Constitutional statement

> The Kernel exists to provide durable, reusable and organization-neutral capabilities. It must become stronger with each Organization without becoming owned by any of them.
