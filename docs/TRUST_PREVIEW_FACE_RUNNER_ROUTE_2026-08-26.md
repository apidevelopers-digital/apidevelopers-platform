# Trust Preview / Face — Runner Route

**Status:** continuity checkpoint
**Date:** 2026-08-26
**Repository:** `apidevelopers-digital/apidevelopers-platform`
**Front:** Trust Preview / Face / UniJuri Keychain

## 1. Operational source of truth

Do not assume a runner name from stale GPT memory. Before changing `runs-on`, verify the live organization runner inventory.

Evidence supplied from GitHub Organization Settings > Actions > Runners on 2026-08-26 shows six active self-hosted macOS runners:

- `apidevelopers-mac-ci-01`
- `apidevelopers-mac-ci-02`
- `apidevelopers-mac-ci-03`
- `apidevelopers-mac-ci-04`
- `apidevelopers-mac-ci-05`
- `pidevelopers-mac-ci-06`

Observed common labels include `self-hosted`, `macOS`, `X64`, and `apidevelopers`; some runners also show `organization-macos-ci`.

At this checkpoint, no runner named or labeled `igor-mac-runner` was visible in the live inventory.

## 2. Current blocking evidence

- PR #316 merged to `main` at `adffd04d65dc9e71b5aa5c3e8040ea6c9d23e00e`.
- The merged UniJuri provisioning workflow currently requires the extra selector `igor-mac-runner`.
- Provisioning run #3 (`33024424849`) remained queued with `runner_id: 0` and no assigned runner.
- A separate `UniJuri Keychain Helper Install` run landed on `apidevelopers-mac-ci-05`.
- On `apidevelopers-mac-ci-05`, the native helper build succeeded; the job failed at `Preflight privileged install` because the workflow requires passwordless non-interactive `sudo`.

## 3. Chosen runner for this front

Use **`apidevelopers-mac-ci-05`** as the first dedicated UniJuri Keychain operator host.

Reason: it is the runner with direct existing evidence for this exact helper-install path. Keeping the same host minimizes variables while resolving the privileged-install boundary.

Do not rely on the runner *name* as a `runs-on` label unless GitHub confirms that label exists.

## 4. Safe routing rule

Preferred deterministic route:

1. add/verify one unique runner label on `apidevelopers-mac-ci-05`, e.g. `unijuri-keychain`;
2. target provisioning/helper workflows with:
   - `self-hosted`
   - `macOS`
   - `X64`
   - `unijuri-keychain`
3. make the helper available on that runner and verify `/usr/local/libexec/apidevelopers/operator-keychain-helper` is executable;
4. only then execute create-only UniJuri provisioning;
5. collect only the public key and sanitized evidence;
6. continue Trust Preview / Face end-to-end validation.

## 5. Safety boundary

Do not repeat provisioning blindly while a prior create-only attempt may have partially written local state.

Before another real provisioning run, confirm:
- deterministic runner selection;
- helper executable readiness;
- create-only semantics;
- no secret output;
- exact approved `main` SHA.

## 6. Next operational action

First fix deterministic runner selection around `apidevelopers-mac-ci-05` and its unique capability label. Do not start a new provisioning run until that route is verified.
