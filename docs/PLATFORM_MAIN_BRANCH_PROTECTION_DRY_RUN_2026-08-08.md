# Platform Main Branch Protection Dry-Run — 2026-08-08

**Repository:** `apidevelopers-digital/apidevelopers-platform`
**Target:** `main`
**Mode:** dry-run only
**Execution:** no repository setting is changed by this document.

## Reanchored state

- canonical `main`: `c906953ceab603f7fa898a4788853c7edc1064c8`;
- repository visibility: public;
- no branch-protection rule currently applies to `main`;
- current stable baseline workflow: `Platform Baseline CI`;
- exact job/check context emitted by the workflow: `Platform Baseline Gate`;
- institutional runner labels:
  - `self-hosted`
  - `macOS`
  - `X64`

GitHub documents protected branches as available for public repositories on GitHub Free and GitHub Free for organizations.

## Candidate minimum policy

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Platform Baseline Gate"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
```

Candidate REST target:

`PUT /repos/apidevelopers-digital/apidevelopers-platform/branches/main/protection`

Candidate rollback:

`DELETE /repos/apidevelopers-digital/apidevelopers-platform/branches/main/protection`

Rollback is itself a sensitive governance write and requires explicit approval.

## Why this is the minimum pilot

- requires the current stable Platform baseline gate;
- uses `strict: true` so the required check evaluates the current base;
- applies the rule to administrators;
- prevents force-push;
- prevents branch deletion;
- avoids requiring multiple human reviewers while the institution remains effectively single-owner operated;
- does not lock the branch;
- does not add bypass actors;
- does not change runtime, deploy, DNS, Hostinger or production.

## Validation after any approved application

The pilot is not complete until all are evidenced:

1. branch readback reports `protected: true`;
2. required status checks contain exactly `Platform Baseline Gate`;
3. strict mode is true;
4. admin enforcement is active;
5. force-push is disabled;
6. branch deletion is disabled;
7. a harmless PR triggers `Platform Baseline Gate`;
8. merge is blocked while the required gate is pending/failing;
9. merge becomes eligible after the gate succeeds;
10. rollback path remains documented and recoverable.

## Stop conditions

Stop and reanchor if:

- GitHub rejects the policy;
- the exact required-check context is not emitted;
- the runner is unavailable;
- a harmless PR remains blocked after a green gate;
- an unexpected repository-wide side effect appears;
- readback differs materially from the reviewed policy.

## Security boundary

This dry-run does not authorize or execute branch protection, rulesets, secret scanning, push protection, Dependabot changes, code scanning, deploy, DNS or production writes.

## Next gate

After PR review and green CI, request explicit approval for **only the `apidevelopers-platform/main` branch-protection pilot**. Do not bundle other security settings into the same action.
