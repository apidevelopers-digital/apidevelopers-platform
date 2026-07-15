# AP Repository

Status: Foundation v1
Owner: API Developers.digital
Maturity: L1 -> L2

## Mission

Provide a neutral repository automation layer for GitHub, GitLab and future source-control providers.

## Responsibilities

- read repository content;
- create or update files idempotently;
- resolve current file SHA before updates;
- create branches and pull requests;
- validate payloads before provider calls;
- return commit and file evidence;
- emit audit and operational events;
- isolate provider-specific behavior behind adapters.

## Out of scope

- product business rules;
- raw secret storage;
- automatic production merge;
- direct provider calls from product code.

## Canonical operations

- readFile
- writeFile
- deleteFile
- createBranch
- openPullRequest
- compareBranches
- listCommits
- dispatchWorkflow

## Write pipeline

1. Read branch state.
2. Check whether the target exists.
3. Read current SHA for updates.
4. Validate content.
5. Encode UTF-8 content automatically.
6. Validate Base64 round-trip.
7. Build the complete provider payload.
8. Execute once.
9. Confirm commit SHA.
10. Re-read the target.
11. Record evidence.

## Permanent rules

1. Never assemble Base64 manually.
2. Never update an existing file without current SHA.
3. Never report success without commit evidence.
4. Provider errors are normalized into platform errors.
5. Retries are allowed only for idempotent operations.
6. Sensitive operations require explicit approval and audit.
7. Provider adapters must be replaceable.

## Completion criteria

- architecture documented;
- provider contract versioned;
- GitHub adapter implemented;
- create/update/read flows tested;
- conflict and retry behavior tested;
- audit and event hooks implemented.
