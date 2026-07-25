# Canonical Runner Policy

This repository uses the organization-level macOS self-hosted runner group as the canonical execution environment for CI workflows.

## Canonical organization runner

- Scope: organization `apidevelopers-digital`
- Runner group: `organization-macos-ci`
- Active runner: `apidevelopers-mac-ci-01`
- Required labels:
  - `self-hosted`
  - `macOS`
  - `X64`

## Required workflow configuration

```yaml
runs-on:
  group: organization-macos-ci
  labels: [self-hosted, macOS, X64]
```

The group restricts execution to organization-managed runners. The labels restrict execution to the required operating system and architecture.

## Node.js

Node.js is configured inside each job with `actions/setup-node`. Node.js does not replace, rename, start, or stop the self-hosted runner.

## Legacy runner record

A repository-level record named `igor-mac-runner` was observed offline. No corresponding local registration was found on the audited Mac.

Current classification:

- Confirmed: `apidevelopers-mac-ci-01` is the active organization runner.
- Confirmed: current jobs are served through `organization-macos-ci`.
- Pending: audit the origin and exact scope of `igor-mac-runner`.
- Blocked by safety: do not delete the legacy record without a dedicated audit and explicit approval from Igor.

Workflows must not target the legacy runner by name.

## Operational rules

1. Workflows must not use `ubuntu-latest`, `macos-latest`, `windows-latest`, or another GitHub-hosted runner by default.
2. Using a GitHub-hosted runner requires an explicit, documented decision.
3. A CI run is considered institutionally validated only when the workflow targets `organization-macos-ci`, matches the required labels, and completes successfully.
4. No merge should be performed solely because a workflow passed on a different runner.
5. Runner changes must be reviewed as operational infrastructure changes.
6. Do not run `config.sh` again on an already registered runner.
7. Do not remove offline runner records before confirming origin, scope, history, and dependencies.
