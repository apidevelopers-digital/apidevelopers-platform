# API Developers.digital — Engineering Operating System

Status: Active  
Date: 2026-07-15  
Owner: API Developers.digital

## Purpose

Define the system used to design, build, validate, release and improve the platform continuously.

## Engineering areas

- Platform Engineering
- API Engineering
- AI Engineering
- Integration Engineering
- Automation Engineering
- Security Engineering
- Developer Experience
- Quality Engineering
- Platform Operations

## Delivery cycle

1. Capability
2. Domain
3. Architecture Decision Record
4 . Canonical contract
5. Implementation
6. Automated tests
7. Security review
8. Observability
9. Evidence
10. Release
11. Measurement
12. Improvement

## Quality gates

A change may be merged only when:
- the owner domain is clear;
- the contract is versioned;
- tests pass;
- tenant isolation is preserved;
- secrets are absent from code and logs;
- events and audit are present when required;
- documentation is updated;
- rollback is defined for risky changes;
- evidence of execution exists.

## Definition of Done

A delivery is done only when:
- architecture is understood;
- the implementation is reviewable;
- tests are repeatable;
- security and risk are classified;
- operational evidence is available;
- documentation and ownership are current;
- merge and release states are not misrepresented.

## Failure learning

A failure that repeats is a process defect.

For each repeated failure:
1. identify the root cause;
2. correct the current implementation;
3. register a permanent rule;
4. add an automated check when possible;
5. verify that the failure does not recur.

## Engineering metrics

- runs per change
- relevant runs per change
- real defects
- infrastructure failures
- reruns
- commits to green
- contract-to-stable time
- regressions
- change failure rate
- mean time to recover

## Operating rules

1. Small, reviewable changes.
2. One responsibility per commit.
3. No production action without explicit approval.
4. No merge without quality gates.
5. No success claim without evidence.
6. Every domain has an owner, a contract and a test strategy.
7. Every lesson that prevents recurrence becomes part of the Engineering Operating System.
