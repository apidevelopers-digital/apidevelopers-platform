# ADR: Asset package upload is required for batch media deployment

> Status: accepted in draft branch
> Date: 2026-10-08
> Scope: ADA Asset Engine v1
> Decision owner: API Developers.digital / Igor

## Context

During the Hidden Arquives Greys implementation, the system proved that it can:

- preserve approved originals as canonical assets;
- stage a ZIP file already present on the server;
- extract a staged ZIP safely;
- validate extracted files with SHA-256.

However, a hard operational gap remains: moving a canonical package from the assistant/runtime working area into the production `asset-inbox` without manually pasting large binary/Base64 content image by image.

For scale, the institution must not rely on manual per-image upload or ad hoc binary pasting through chat.

## Decision

ADA Asset Engine must include a controlled package upload step:

```text
asset-package.upload
→ asset-package.extract
→ manifest verify
→ publish batch
→ HTTP/SHA validation
```

The upload step must support canonical ZIP packages containing approved original assets and manifests.

## Required contract

`asset-package.upload` must:

- accept chunked package upload;
- validate the final SHA-256 before the package becomes usable;
- write only inside an allowlisted staging root;
- persist package metadata:
  - tenant;
  - project;
  - package id/version;
  - bytes;
  - sha256;
  - created timestamp;
  - upload status;
- support resumable or staged upload where possible;
- reject package promotion when chunks are missing or the final SHA-256 differs;
- never publish files directly during upload.

## Staging root

For the current Hidden Arquives Hostinger adapter, staged packages must live under:

```text
/home/u242521810/domains/hiddenarquives.tech/public_html/asset-inbox/packages/
```

Extraction must only happen after upload validation and must target an allowlisted staging or publication path.

## Required package flow

```text
1. Upload ZIP parts.
2. Finalize package and validate SHA-256.
3. Extract ZIP with zip-slip protection.
4. Read manifest.json from extracted package.
5. Confirm every manifest original exists with exact SHA-256.
6. Publish canonical originals in batch.
7. Update public manifest/catalog.
8. Render/inject page.
9. Validate public HTTP, size and SHA where possible.
10. Produce audit report.
```

## Forbidden

- Treating thumbnails, previews or recompressed images as canonical originals.
- Publishing a package before the final package SHA-256 is confirmed.
- Extracting archives outside allowlisted roots.
- Uploading one approved production pack by manually pasting each image as an operational norm.
- Claiming a batch package is published when only the ZIP upload or extraction step succeeded.

## Operational note

For emergency or small tests, existing `files.write` with `contentParts` may stage a small ZIP. For production packs and 50-domain scale, the official path is `asset-package.upload` followed by `asset-package.extract`.

## First consumer

Hidden Arquives Greys canonical originals v1 is the first consumer of this contract.
