# AuraFace 512D — authorized sample fleet probe Blocker v1

**Data:** 2026-09-06  
**Scope:** read-only presence diagnostic only 

## Confirmed baseline

The known-good single-runner presence workflow remains:

`$github/workflows/trust-face-authorized-sample-presence-once.yml`

It has already executed successfully on multiple macOS/X64 self-hosted runners and has returned `authorizedSampleFound=false` without opening an image or executing inference.

## Fleet-probe attempts

A new fleet-probe workflow was introduced to reduce scheduler ambiguity caused by jobs moving among multiple runners.

The following runs all terminated before GitHub Actions created an executable job graph:

- `34015426170` - initial fleet workflow - `FAILURE`
- `34015677743` - simplified matrix version - `FAILURE`
- `34015851176` - explicit parallel jobs - `FAILURE`
- `34016241445` - minimal two-job form based on the known-good single-probe workflow - `FAILURE`

The last source commit is `1352ed958822a3471ce6dcfb4cbd3dd2410621aa`.

## Interpretation

**Confirmed:** the fleet probe path is blocked at GitHub Actions workflow validation/registration before a runner job begins.

**Confirmed:** these fleet-probe failures did not read an image, did not access a biometric sample, did not access the AuraFace model, and did not execute inference.

**Confirmed:** the platform and Trust Face baseline CI continue to pass on the working branch despite the diagnostic workflow failures.

**Inferred:** the repository/workflow path needs a separate GitHub Actions validation diagnostic before any further fleet-probe variants are justified.

## Safety state

Remain false:

- `inverenceExecuted=false`
- `benchmarkExecuted=false`
- `thresholdApplied=false`
- `matchedClaimed=false`
- `identityClaimed=false`
- `productionAuthorized=false`
- `productionReady=false`
- `biometricClaimReady=false`

## Next gate

Do not create more fleet-probe variants until the GitHub Actions workflow-validation blocker is isolated.

The only proven presence probe remains the known-good single-workflow version. Repeating it blindly is a low-value operation until the sample is provisioned to a known runner.
