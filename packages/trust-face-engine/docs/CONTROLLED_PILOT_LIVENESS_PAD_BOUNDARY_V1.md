# Controlled Pilot v0 — Liveness/PAD Boundary V1

**Status:** boundary-only / fail-closed  
**Scope:** Controlled Pilot v0 only  
**Production authorization:** no  
**High-assurance PAD claim:** no

## Purpose

This boundary closes the Controlled Pilot v0 readiness requirement for liveness/PAD without promoting laboratory-derived PAD signals into a real anti-spoofing decision.

The existing `liveness-pad-lab-v1` remains a laboratory component. It may produce derived-signal laboratory evidence, but it explicitly does not establish:

- real liveness;
- bona fide / attack classification;
- high-assurance PAD;
- origin attestation;
- active challenge verification;
- production readiness;
- biometric identity authorization.

## Pilot boundary

`controlled-pilot-liveness-pad-boundary-v1.mjs` is intentionally fail-closed.

It permits only sanitized metadata describing that laboratory evidence exists. It rejects raw image, video, frame, embedding and biometric-template payloads.

It also rejects operational PAD/liveness fields such as scores, thresholds, `live`/`spoof` decisions, presentation-attack decisions or identity outputs.

A valid boundary receipt always keeps these claims false:

- `livenessEvaluated`
- `padEvaluated`
- `activeChallengeExecuted`
- `originAttested`
- `thresholdApplied`
- `liveSpoofDecisionEmitted`
- `highAssurancePadClaimed`
- `identityDecisionEmitted`
- `productionAuthorized`
- `productionReady`

## Interpretation

A green boundary test means only that the controlled pilot has an explicit, testable rule preventing liveness/PAD laboratory signals from being misrepresented as a real anti-spoofing or production decision.

It does **not** mean that PAD has been validated against presentation attacks, benchmarked, certified, independently validated or approved for production.

Even when the Controlled Pilot v0 readiness metric reaches `100/100`, that metric remains a supervised, consented and non-authoritative pilot-readiness measure. It is not production readiness.
