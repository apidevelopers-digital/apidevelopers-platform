# Hostinger Publisher v1 — canonical publishing layer

Status: proposed implementation block  
Scope: ADA Asset Engine / Hostinger publication for Hidden Arquives and future sites  
Production writes: gated by explicit approval and ActionGate

## Objective

Replace manual Hostinger uploads with a controlled institutional publisher.

The publisher must let ADA Asset Engine publish approved packages to Hostinger with:

- no secrets in chat, logs, artifacts or GitHub content;
- explicit approval before production writes;
- path allowlist validation;
- immutable publish plan;
- automatic backup before overwrite;
- atomic or staged release when possible;
- post-publication HTTP validation;
- rollback report and rollback action;
- audit trail linked to PR, commit, run and approval.

## Current blocker

The current operator can read Hostinger files and generate Hostinger upload URLs, but it cannot yet complete the production write for Hidden Arquives.

Observed blockers:

- filesystem write is blocked because `hiddenarquives.tech` is outside the operator runtime allowed roots;
- Hostinger file content API exposed through the operator is read-only for `files/content`;
- upload URL generation exists, but the operator needs an internal TUS uploader so headers and credentials stay server-side.

This is not a user-token problem. Igor must not paste tokens in chat.

## Correct architecture

```text
GitHub PR / approved asset package
        |
        v
ADA Asset Engine manifest + publish plan
        |
        v
ActionGate approval
        |
        v
Hostinger Publisher v1
        |
        +--> validate allowlisted root
        +--> create backup snapshot
        +--> upload package or files using backend secrets only
        +--> verify remote file list and checksums where available
        +--> run HTTP validation
        +--> emit publish report
        +--> expose rollback action
```

## Required backend action

Add a controlled operator action:

```text
hostinger.files.publishArchive
```

Recommended payload:

```json
{
  "account": "u242521810",
  "domain": "hiddenarquives.tech",
  "targetRoot": "/home/u242521810/domains/hiddenarquives.tech/public_html",
  "targetPath": "greys",
  "archiveAssetId": "internal-asset-or-upload-id",
  "publishPlanPath": "artifacts/asset-engine/dry-run/hostinger-publish-plan.json",
  "backup": true,
  "httpValidation": true,
  "dry_run": true
}
```

Production execution must require ActionGate approval.

## Required allowlist

The operator must allow writes only under registered safe roots.

For Hidden Arquives, the required root is:

```text
/home/u242521810/domains/hiddenarquives.tech/public_html
```

Allowed publish destinations for this block:

```text
/home/u242521810/domains/hiddenarquives.tech/public_html/greys
/home/u242521810/domains/hiddenarquives.tech/public_html/assets/species/greys
```

Any path outside the root must hard-fail.

## Secrets policy

The publisher must never return or log:

- Hostinger API tokens;
- TUS upload headers;
- SSH keys;
- SFTP passwords;
- `.env` contents;
- bearer tokens;
- signed upload URLs when they include secret material.

The response may include only:

- action id;
- domain;
- target path;
- counts;
- checksums;
- validation result;
- public URLs;
- sanitized error codes.

## Publish flow

### 1. Dry-run

Input:

- approved asset package;
- manifest;
- Hostinger publish plan;
- target domain;
- target root.

Output:

- publish simulation report;
- list of files to create/overwrite;
- backup plan;
- HTTP validation plan.

No production write.

### 2. Approval

Required phrase for Greys:

```text
Igor aprova publicação real SFTP do ADA Asset Engine para Hidden Arquives Greys.
```

The backend may map this to an ActionGate approval. The phrase alone must not bypass plan validation.

### 3. Real publish

The action must:

1. re-read the approved plan;
2. verify plan hash;
3. verify all source files exist;
4. verify target paths are allowlisted;
5. create backup;
6. publish files;
7. verify remote presence;
8. run HTTP validation;
9. emit publish report.

### 4. Rollback

Rollback must restore only files listed in the backup manifest.

Rollback must not delete unrelated remote files.

## Reports

The publisher should emit these reports:

```text
hostinger-publish-plan.json
hostinger-publish-report.json
hostinger-backup-report.json
hostinger-http-validation-report.json
hostinger-rollback-plan.json
```

## API contract

### Create publish action

```text
POST /v1/hostinger/publish/archive
```

Creates an ActionGate item. Does not publish automatically.

### Approve publish action

```text
POST /v1/actions/:id/approve
```

Requires explicit human approval.

### Execute publish action

```text
POST /v1/actions/:id/execute
```

Executes only if:

- approved;
- plan hash matches;
- target root is allowlisted;
- backup succeeds;
- secrets are available server-side.

### Get publish action

```text
GET /v1/actions/:id
```

Returns sanitized action state.

## GitHub integration

For ADA Asset Engine, the workflow should be:

1. PR stores asset package or references immutable artifact;
2. CI generates manifest and publish plan;
3. publish job creates ActionGate request;
4. production deploy waits for approval;
5. operator publishes and validates;
6. PR records report links.

## Acceptance criteria for this blocker

This blocker is resolved only when all are true:

- the operator can write to `hiddenarquives.tech` without path scope error;
- the operator can publish a package without exposing secrets;
- a dry-run report exists before real publish;
- real publish requires ActionGate approval;
- backup is created before overwrite;
- HTTP validation report confirms the public URL;
- rollback plan exists;
- the final public link is returned only after validation.

## Greys target

Canonical public link:

```text
https://greys.hiddenarquives.tech/
```

Fallback page path when needed:

```text
https://greys.hiddenarquives.tech/greys/index.html
```

## Non-goals

This block must not:

- require Igor to paste tokens in chat;
- require manual Hostinger panel upload as normal operation;
- expose credentials in GitHub or logs;
- publish without approval;
- merge the PR automatically;
- alter DNS;
- send WhatsApp, e-mail or VNNOX messages.
