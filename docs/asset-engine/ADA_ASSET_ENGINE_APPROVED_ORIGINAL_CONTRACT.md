# ADA Asset Engine — Approved Original Contract v1

> Status: institutional contract
> Applies to: ADA Asset Engine v1, Hidden Arquives / Hidden Archives, and every future institutional asset consumer
> Principle: **approved means canonical original**

## 1. Non-negotiable rule

When Igor or an authorized human approves an image, video, document, or other media file, the approved file becomes the **canonical original**.

The canonical original is the exact approved byte sequence.

The engine must never silently replace it with:

- a resized image;
- a recompressed image;
- a draft;
- a preview;
- a thumbnail;
- a lower-quality export;
- a visually similar regenerated file;
- any derivative that does not match the approved original hash.

If the exact approved file is not available to the publishing environment, the asset remains pending. The engine must not publish a substitute.

## 2. Definitions

### Approved original

The human-approved file, preserved exactly as approved.

Required properties:

- immutable after approval;
- hash-addressed;
- stored or referenced as the source of truth;
- publishable without transformation;
- never overwritten by a derivative;
- never renamed in a way that loses the hash/audit relationship.

### Canonical original

The approved original as recorded in the manifest.

The canonical original must include:

- `kind: "approved_original"`;
- `exact_bytes_required: true`;
- `sha256`;
- `size_bytes`;
- `mime`;
- optional dimensions when available;
- storage or public URL after publication.

### Derivative

Any file generated from the canonical original for performance, channel compatibility, preview, thumbnail, mobile, WhatsApp, email, VNNOX, or campaign usage.

A derivative must derived: from the canonical original and include:

- `kind: "derivative"`;
- `derived_from_sha256`;
- transformation notes;
- its own hash;
- its own storage/public URL.

A derivative can help delivery, but it is never the approved asset itself.

## 3. Hard invariants

1. `approved` assets require a canonical original.
2. `published` assets require the canonical original to be stored or publicly reachable.
3. A derivative cannot exist without a canonical original.
4. A derivative must point to `derived_from_sha256`.
5. A page may use a derivative only when the manifest explicitly allows that display mode.
6. When visual fidelity matters, the page must use the canonical original by default.
7. If a channel requires optimization, the optimized derivative must be labeled as a derivative.
8. A failed upload, missing original, hash mismatch, or unavailable source blocks publication.
9. The engine must report the block instead of silently publishing a degraded substitute.
10. Batch publishing must validate all canonical originals before updating public injection targets.

## 4. Correct flow


```text
approved file
  ↓
canonical original ingest
  ↓
sha256 + sha1 + size + mime + dimensions
  ↓
approved/original storage
  ↓
manifest records canonical original
  ↓
optional derivatives generated from canonical original
  ↓
publish plan validates originals first
  ↓
batch publish originals + derivatives
  ↓
HTML/template injects from manifest
  ↓
HTTP/hash/size validation
  ↓
report + audit
```

## 5. Incorrect flow

```text
approved preview
  ↓
compressed export
  ↓
published as if it were the approved original
```

This is forbidden.

The engine must also reject this variant:

```text
approved image
  ↓
q65/q45 operational export
  ↓
only derivative reaches the site
  ↓
original hash is lost
```

That is a quality-loss bug, not a valid publication.

## 6. Required storage layout

Recommended static layout:

```text
assets/
  species/
    greys-approved/
      original/
        001-hero.<ext>
        002-council.<ext>
      derived/
        web-1600/
        web-1280/
        web-960/
        thumb/
      manifests/
        greys-cinematic-v1.json
```

For object storage/CDN, the same separation must exist in keys or metadata:

```text
tenant/project/original/<asset>
tenant/project/derived/<purpose>/<asset>
tenant/project/manifests/<version>.json
```

## 7. Manifest shape

Minimum record:

```json
{
  "asset_id": "ast_hiddenarquives_greys_001_hero",
  "tenant": "hiddenarquives",
  "project": "greys",
  "type": "image",
  "role": "hero",
  "status": "approved",
  "canonical_policy": "approved-original",
  "original": {
    "kind": "approved_original",
    "exact_bytes_required": true,
    "filename": "001-hero.jpg",
    "mime": "image/jpeg",
    "sha256": "sha256-of-the-approved-file",
    "sha1": "sha1-of-the-approved-file",
    "size_bytes": 1234567,
    "width": 2048,
    "height": 1152,
    "storage": {
      "provider": "hostinger",
      "remote_path": "/home/.../public_html/assets/species/greys-approved/original/001-hero.jpg"
    },
    "public_url": "https://hiddenarquives.tech/assets/species/greys-approved/original/001-hero.jpg"
  },
  "derivatives": {
    "web_1280": {
      "kind": "derivative",
      "purpose": "web",
      "derived_from_sha256": "sha256-of-the-approved-file",
      "transformation": {
        "resize": "1280w",
        "format": "jpeg",
        "quality": 88
      },
      "sha256": "sha256-of-derived-file",
      "size_bytes": 234567,
      "public_url": "https://hiddenarquives.tech/assets/species/greys-approved/derived/web-1280/001-hero.jpg"
    }
  }
}
```

## 8. Publish gate errors

The engine must produce explicit errors for these cases:

```text
canonical_original_required
canonical_original_missing_sha256
canonical_original_missing_storage
canonical_original_hash_mismatch
canonical_original_unavailable
derivative_without_canonical_original
derivative_source_hash_mismatch
approved_asset_published_as_derivative
display_derivative_without_manifest_policy
batch_contains_unverified_original
```

## 9. Batch requirement

Manual asset-by-asset publication is not the scale target.

For 10, 20, or 50 assets, the engine must prefer:

```text
batch package
  ↓
manifest
  ↓
publish plan
  ↓
batch copy/upload
  ↓
batch validation
  ↓
single template/render update
```

Batch publication must not degrade quality to make transport easier. If transport cannot carry the original, the transport layer must be fixed.

## 10. Hidden Arquives / Greys correction

For the Greys package:

- the user-approved images are the canonical originals;
- q65/q45 JPEGs are only operational derivatives;
- the current public derivatives must be treated as temporary progress assets;
- the final Greys package must publish originals first, then optional derivatives;
- the public page must not claim a derivative is the approved original.

## 11. Operational language

Use this wording in reports:

- `canonical original stored`
- `canonical original published`
- `derivative generated from canonical original`
- `blocked: canonical original unavailable`
- `blocked: derivative cannot replace approved original`

Avoid this wording unless it is literally true:

- `approved asset published`

when only a derivative was published.
