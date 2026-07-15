# API Developers.digital Operating Model (ADOM)

Status: Active
Owner: API Developers.digital

## Purpose

Define how ideas become governed, reusable and production-ready platform capabilities.

## Operating layers

- ADOM: priorities, approvals and lifecycle.
- ADES: engineering standards and quality gates.
- Platform Factory: scaffolding, templates and automation.
- Platform: reusable capabilities.
- Products: consumers of platform capabilities.
- Ecosystem: SDKs, APIs, portal and partner tooling.

## Capability lifecycle

1. Idea
2. Research
3. Architecture
4. ADR
5. Factory
6. Contracts
7. Implementation
8. Tests
9. Validation
10. Production
11. Observability
12. Evolution
13. Industrialization

## Decision gates

A capability advances only when:
- ownership is explicit;
- scope is classified as reusable or product-specific;
- contracts are versioned;
- tenant isolation is preserved;
- risk and security are classified;
- tests are repeatable;
- observability and audit are defined;
- evidence exists for the current maturity level.

## Responsibility model

- Igor: strategic owner and explicit approver for sensitive or production actions.
- API Developers.digital Engineering: architecture and implementation.
- ADES: quality, security, validation and learning.
- Platform Factory: templates, scaffolding and automated checks.
- Product teams: product-specific workflows and experiences.
- uni.: premium customer of the platform.
- uni.co: intelligent product built on platform capabilities.

## Permanent rules

1. Products do not own shared platform capabilities.
2. No production action without explicit approval.
3. No success claim without evidence.
4. Repeated failures become process defects.
5. Relevant lessons become rules, tests, automation or playbooks.
6. Every sprint leaves reusable technical or engineering value.
7. Architecture must scale from one customer to ten thousand without manual redesign.
