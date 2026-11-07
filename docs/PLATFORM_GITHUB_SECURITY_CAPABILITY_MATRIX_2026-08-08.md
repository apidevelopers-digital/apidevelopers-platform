# Platform GitHub Security Capability Matrix — 2026-08-08

**Repository:** `apidevelopers-digital/apidevelopers-platform`
**Visibility:** public
**Status:** read-only capability assessment; no setting change is authorized by this document.

## Evidence sources

- current GitHub repository metadata;
- current branch-protection readback;
- GitHub Docs for public-repository security features.

## Capability matrix

| Control | Current observed state | Public-repository capability | Classification |
|---|---|---|---|
| Branch protection | no rule on `main` | available for public repositories on GitHub Free / Free for organizations | **AVAILABLE / NOT ENABLED** |
| Repository rulesets | no active ruleset evidence recorded | available for public repositories on GitHub Free / Free for organizations | **AVAILABLE / NOT ENABLED** |
| Secret scanning | repository metadata reports disabled | GitHub documents secret scanning for public repositories as free/automatic for supported patterns | **CAPABILITY AVAILABLE; METADATA READBACK REQUIRES CARE** |
| Push protection | repository metadata reports disabled | GitHub provides push protection for secrets; exact repository/org setting must be checked before mutation | **REQUIRES REPOSITORY/ORG SETTING CAPABILITY CHECK** |
| Dependabot security updates | repository metadata reports disabled | GitHub supports security-update PRs for vulnerable dependencies; exact repository behavior must be read back before mutation | **CAPABILITY AVAILABLE; EXACT SETTING BEHAVIOR MUST BE VERIFIED** |
| Secret validity / extended metadata | repository metadata reports disabled | GitHub documents validity and extended-metadata checks as restricted to higher-plan secret-protection capabilities in many contexts | **RESTRICTED / DO NOT ASSUME** |
| Code scanning | not assessed as enabled | available for public repositories; configuration requires separate review | **AVAILABLE / NOT YET CLASSIFIED** |

## Interpretation

1. **Branch protection or a repository ruleset is the clearest next native governance control to evaluate.**
2. Secret scanning has public-repository coverage, but current repository metadata must not be over-interpreted; a setting-level readback is needed before claiming a specific repository-level state.
3. Push protection, Dependabot security updates and code scanning should be evaluated separately; do not bundle unrelated security settings into one write.
4. Any setting mutation is a sensitive governance action and requires explicit approval, readback and a rollback path.

## Recommended first pilot

The lowest-ambiguity pilot is **native protection of `main` using only the current stable `Platform Baseline Gate` as the required status check**, with:

- strict required status check;
- admin enforcement;
- force-push disabled;
- branch deletion disabled;
- no mandatory multiple human reviewers by default;
- no branch lock;
- explicit rollback path;
- harmless PR validation after application.

This is only a candidate policy. It is not applied by this document.

## Next gate

After this document is reviewed and CI is green, prepare the exact branch-protection dry-run payload for `apidevelopers-platform/main` and request explicit approval before any repository-setting write.
