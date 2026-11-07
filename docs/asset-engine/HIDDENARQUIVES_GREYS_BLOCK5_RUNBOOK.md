# Hidden Arquives / Greys — Block 5 ingestion runbook

Status: active runbook  
Scope: ADA Asset Engine v1 / Hidden Arquives Greys  
Production publish: blocked until explicit approval

## Objective

Ingest the approved real Greys assets into:

```text
media/sources/hiddenarquives/greys/
```

Then regenerate auditable local artifacts with real SHA1 hashes, without publishing to Hostinger.

## Macroblock execution

### 5A — Repository readiness

Confirmed by this block:

- source directory is versioned;
- expected file inventory is documented;
- ingest validator exists;
- workflow can generate an ingest report;
- publish remains blocked by the existing safety gate.

### 5B — Real asset drop

Add exactly these files:

```text
001-hero.png
002-council.png
003-anatomy.png
004-navigation.png
005-learning.png
006-life-cycle.png
007-society.png
008-adult.png
009-nursery.png
010-encounters.png
```

No generated files, secrets, exports with credentials, or Hostinger material should be placed in the source directory.

### 5C — Strict ingest validation

Run:

```bash
node scripts/asset-engine-ingest-greys.mjs --strict
```

Acceptance criteria:

- `strict_ready` is `true`;
- `missing_sources` is empty;
- `extra_source_files` is empty;
- all ten expected assets have `source_exists: true`;
- all ten expected assets have non-null SHA1 values.

Output:

```text
artifacts/asset-engine/dry-run/hiddenarquives-greys-ingest-report.json
```

### 5D — Manifest, preview and Hostinger plan

Run:

```bash
node scripts/asset-engine-dry-run-greys.mjs
node scripts/asset-engine-render-greys.mjs
node scripts/asset-engine-hostinger-plan-greys.mjs
```

Acceptance criteria:

- manifest reports `has_real_hashes: true`;
- manifest reports `sources_found: 10`;
- manifest reports `sources_missing: []`;
- HTML preview is generated locally;
- Hostinger publish plan contains 10 real assets plus the generated HTML page;
- all remote paths remain under `/home/u242521810/domains/hiddenarquives.tech/public_html`.

### 5E — Publish gate check

Run:

```bash
node scripts/asset-engine-hostinger-publish-greys.mjs
```

Expected behavior in this block:

- gate may pass dry-run validation;
- `sftp_executed` remains `false`;
- no production file is changed.

## Explicit non-goals

This block must not:

- publish to Hostinger;
- execute SFTP;
- delete remote files;
- change DNS;
- send WhatsApp;
- send e-mail;
- publish to VNNOX/telões;
- merge the PR;
- treat local artifacts as deployed production.

## Approval required before real publication

Before any real SFTP publication, the required approval phrase is:

```text
Igor aprova publicação real SFTP do ADA Asset Engine para Hidden Arquives Greys.
```

Even with approval, real publication remains blocked until the repository has:

- approved real assets committed;
- strict ingest report;
- manifest with real SHA1 hashes;
- Hostinger publish plan with real files;
- publish gate report;
- rollback plan;
- planned HTTP post-publication validation.
