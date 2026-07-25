# Canonical Runner Policy

This repository uses the local macOS self-hosted runner as the canonical execution environment for CI workflows.

## Canonical runner

- Name: `igor-mac-runner`
- Required labels:
  - `self-hosted`
  - `macOS`
  - `X64`

## Required workflow configuration

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

## Operational rules

1. Workflows must not use `ubuntu-latest`, `macos-latest`, `windows-latest`, or another GitHub-hosted runner by default.
2. Using a GitHub-hosted runner requires an explicit, documented decision.
3. A CI run is considered locally validated only when the workflow targets the required self-hosted labels and completes successfully.
4. No merge should be performed solely because a workflow passed on a different runner.
5. Runner changes must be reviewed as an operational infrastructure change.

## Current canonical status

- Planning Engine CI uses `[self-hosted, macOS, X64]`.
- The canonical runner is the MaC runner maintained by Igor.
- Hosted runners are not the default execution path.
