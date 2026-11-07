# @ADAform/asset-engine

Institutional asset and media engine for API Developers.digital.

## Purpose

This package defines the core contracts and helpers for the ADA Asset Engine.

It is designed to power:

- Hidden Arquives / Hidden Archives asset publication.
- Hostinger domain and subdomain injection.
- WhatsApp media drafts.
- Email attachments and public links.
- VNNOX / telao media packages.
- Future CDN/object storage adapters.

## Canonical asset rule

The package follows the institutional contract documented in:

```text
docs/asset-engine/ADR_APPROVED_CANONICAL_ORIGINALS.md
```

Rule:

```text
Approved = Canonical Original
```

When Igor or another authorized human approves an image, video, document or media file, that exact file becomes the canonical original.

The package must preserve and validate the approved original as exact bytes. Resized, compressed, reformatted, thumbnail, mobile, WhatsApp, email, VNNOX or web-optimized outputs are derivatives. Derivatives can be useful, but they never replace the approved original.

Required behavior:

- store the approved original with SHA-256;
- publish the original when the requested output is the approved image itself;
- create derivatives only from the canonical original;
- require derivatives to reference `derived_from_sha256`;
- fail closed when an asset claims to be approved/published/verified without a canonical original;
- never call a lower-quality rendition the original.

## Non-goals in v1

- This package does not include secrets.
- This package does not publish real assets by default.
- This package does not directly send messages or publish to screens.

## Core idea

```text
Ingest -> Preserve approved original -> Process derivatives -> Publish -> Inject -> Verify -> Report
```

## Status

This is a scaffold for v1 implementation.
