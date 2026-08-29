# Trust Face — consented-lab diagnostic evidence — 2026-08-28

## Status

**Exploratory laboratory diagnostic. Not a production biometric claim.**

This record captures aggregate, sanitized evidence from the first consented 1:1 face-verification laboratory after the metric double-application defect was fixed by PR #346.

Source baseline:

- repository: `apidevelopers-digital/apidevelopers-platform`
- evaluated main SHA: `562fba5682ad14fa5165ef64fc05c86cb8bd8b9a`
- authority basis: `consented-lab`
- productionReady: `false`
- biometricClaimReady: `false`
- livenessPad: `false`

No raw face image, raw embedding, face template, direct PII, or subject identifier is stored in this evidence record.

## Consent and data boundary

- 2 adult participants provided explicit voluntary consent for this 1:1 laboratory purpose.
- 17 face images were available across the 2 participants.
- 5 face-negative images were accepted for detector testing.
- Raw assets remained outside GitHub.
- Raw embeddings were not persisted in GitHub or general logs.
- Pair-level identity labels are not persisted here.
- The laboratory result is aggregate-only.

## Experimental split

A deterministic small-sample split was used for the diagnostic:

- detector/metric training: 6 face images (3 per participant) + 3 negative images;
- held-out detector evaluation: 11 face images + 2 negative images;
- held-out verification-eligible face images: 11;
- verification pairs: 27 genuine + 28 impostor = 55 total.

Important limitations:

- only 2 identities are represented;
- multiple pairs reuse the same held-out images, so pair observations are not statistically independent;
- the held-out negative set contains only 2 samples;
- a temporary local annotation helper was used only to bootstrap 5-point landmark labels for detector training; it is not part of the Trust Face runtime;
- no independent landmark ground truth was available in the held-out set, therefore landmark NME was not claimed;
- this run is evidence of current behavior, not evidence of population-level biometric accuracy.

## Held-out detector result

| Metric | Result |
| --- | ---: |
| TP | 11 |
| FP | 0 |
| TN | 2 |
| FN | 0 |
| Precision | 1.0000 |
| Recall | 1.0000 |
| Specificity | 1.0000 |

Interpretation: the prototype-distance detector classified this very small held-out set correctly. Because the negative sample is only `n=2` and no independent landmark NME exists, this must not be promoted as a detector accuracy claim.

## Held-out 1:1 verification result

The corrected evaluation path applies `metricModel` exactly once.

| Cosine threshold | FMR | FNMR | False matches | False non-matches |
| ---: | ---: | ---: | ---: | ---: |
| 0.50 | 0.3929 | 0.5185 | 11/28 | 14/27 |
| 0.60 | 0.1786 | 0.7407 | 5/28 | 20/27 |
| 0.70 | 0.1429 | 0.8889 | 4/28 | 24/27 |
| 0.80 | 0.0000 | 0.9630 | 0/28 | 26/27 |
| 0.90 | 0.0000 | 1.0000 | 0/28 | 27/27 |

Current engine default threshold `0.82`:

- FMR: `0.0000` (`0/28`)
- FNMR: `0.9630` (`26/27`)

Fine diagnostic sweep (not a production threshold selection) found the nearest equal-error region around threshold `0.499`:

- FMR: `0.4286` (`12/28`)
- FNMR: `0.4444` (`12/27`)

Score distributions overlap materially:

| Distribution | Min | Median | Max |
| --- | ---: | ---: | ---: |
| Genuine | 0.2923 | 0.4991 | 0.8345 |
| Impostor | 0.3135 | 0.4698 | 0.7597 |

## Finding

**Confirmed:** the current handcrafted `32x32 -> standardized intensity -> 4x4x8 gradient histogram -> supervised per-dimension metric` baseline does not provide useful real-world 1:1 separation on this consented two-person laboratory.

The detector classification result is encouraging only as a narrow smoke test. The verification result is the controlling evidence: genuine and impostor scores overlap too much, and the default threshold rejects nearly all genuine pairs.

## Consequence

This diagnostic does **not** justify a biometric accuracy claim, production rollout, or threshold ratification.

The next engineering gate is to replace or materially strengthen the face representation/model training path before expanding toward PAD/liveness. Threshold tuning alone is not an acceptable fix because the underlying score distributions overlap.

Raw biometric material remains outside the repository.
