# Canonical Runner Policy

This repository uses the organization-level macOS self-hosted runner pool as the canonical execution surface for CI and governed operational workflows.

## Live organization runner pool

- Scope: organization `apidevelopers-digital`
- Runner group: `organization-macos-ci`
- Observed organization runners:
  - `apidevelopers-mac-ci-01`
  - `apidevelopers-mac-ci-02`
  - `apidevelopers-mac-ci-03`
  - `apidevelopers-mac-ci-04`
  - `apidevelopers-mac-ci-05`
  - `apidevelopers-mac-ci-06`
- Common labels:
  - `self-hosted`
  - `macOS`
  - `X64`
  - `apidevelopers`

General CI must not assume a specific runner name when the workload is stateless.

## Required general workflow configuration

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

The labels constrain execution to the organization-managed macOS/X64 pool.

## Dedicated stateful workloads

Workloads that depend on persistent local state must use a dedicated capability label in addition to the common labels. When a workload is bound to one machine's local state, it must also fail closed if `RUNNER_NAME` does not match the recorded host.

Current UniJuri Keychain route:

- capability label: `unijuri-keychain`
- dedicated host: `apidevelopers-mac-ci-05`
- applies to:
  - `UniJuri Keychain Helper Install`
  - `UniJuri Keychain Provisioning`

Required selector:

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
  - unijuri-keychain
```

Required fail-closed identity check:

```bash
if [[ "${RUNNER_NAME:-}" != "apidevelopers-mac-ci-05" ]]; then
  exit 5
fi
```

Do not route stateful Keychain work to a generic member of the pool.

## Legacy runner record

A historical runner name `igor-mac-runner` exists in older documentation. It must not be targeted or assumed available without fresh GitHub evidence showing an active matching runner/label.

## Node.js

Node.js is configured inside each job with `actions/setup-node`. Node.js does not replace, rename, start, or stop the self-hosted runner.

## Operational rules

1. Workflows must not use `ubuntu-latest`, `macos-latest`, `windows-latest`, or another GitHub-hosted runner by default.
2. Using a GitHub-hosted runner requires an explicit, documented decision.
3. A CI run is institutionally valid only when it targets the intended organization runner capability and completes successfully.
4. No merge should be performed solely because a workflow passed on a different runner capability.
5. Runner changes must be reviewed as operational infrastructure changes.
6. Do not run `config.sh` again on an already registered runner.
7. Do not remove runner records before confirming origin, scope, history, and dependencies.
8. Stateful workloads must document the capability label and host identity that own the local state.
