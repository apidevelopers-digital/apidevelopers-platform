# ADR: Approved assets are canonical originals

> Status: accepted for ADA Asset Engine v1
> Date: 2026-10-08
> Owner: API Developers.digital
> Applies to: Hidden Arquives / Hidden Archives, Hostinger sites, WhatsApp, email, VNNOX, campaigns and client sites

## Decision

When a human approves an image, video, document or media asset, the approved file itself becomes the canonical original.

The canonical original must be preserved and publishable as exact bytes. It must not be silently replaced by a resized, recompressed, preview, draft, thumbnail, lightweight transport copy or any other derivative.

This rule is named:

```text
Approved = Canonical Original
```

## Mandatory contract

For every approved asset:

1. The exact approved file must be stored as the canonical original.
2. The canonical original must have a stable SHA-256 hash.
3. The canonical original must keep its original bytes, format, dimensions and quality unless Igor explicitly approves a different canonical replacement.
4. Any resized, compressed, reformatted or channel-specific file is a derivative.
5. Derivatives must reference the canonical original hash through `derived_from_sha256`.
6. Derivatives are never allowed to replace the canonical original.
7. A public page may use a derivative only when the manifest explicitly marks it as a derivative and the original remains available and traceable.
8. If the requested output is “use the approved image”, the default is to publish the canonical original, not a derivative.
9. The engine must fail closed when it cannot prove that the published original matches the approved original hash.
10. A visual preview is not approval of a lower-quality rendition. Approval applies to the asset shown and approved.

## Disallowed behavior

The engine must not:

- publish a preview or draft as if it were the approved asset;
- recompress the approved asset and call it original;
- downscale the approved asset and call it original;
- replace a canonical original with `q65`, thumbnail, card, mobile, WebP, AVIF or any other derivative;
- claim “asset approved” or “asset published” when only a derivative exists;
- hide quality loss behind the same logical asset name.

## Required manifest shape

Every approved asset record must include:

```json
{
  "canonical_policy": "approved-original",
  "original": {
    "kind": "approved_original",
    "approved": true,
    "exact_bytes_required": true,
    "filename": "001-hero.jpg",
    "mime": "image/jpeg",
    "width": 1600,
    "height": 900,
    "size_bytes": 482931,
    "sha256": "..."
  },
  "derivatives": {
    "web_1280": {
      "kind": "derivative",
      "purpose": "web",
      "derived_from_sha256": "...",
      "transformation": {
        "resize": "1280w",
        "format": "jpeg",
        "quality": 88
      },
      "sha256": "..."
    }
  }
}
```

## Publication rules

### Fidelity-first publication

When the operator receives an approved asset and Igor expects the same image on the site, publish:

```text
original.approved_original
```

### Performance publication

When performance variants are needed, publish both:

```text
original.approved_original
derivatives.*
```

The page may use `srcset`, thumbnails or channel variants, but the manifest and audit must still expose the original.

### Batch publication

Batch publishing must operate on a manifest, not one-off manual HTML edits. For 10, 20 or more assets, the engine must:

1. stage all originals;
2. verify SHA-256 for every original;
3. generate derivative variants only after originals are stored;
4. publish originals and derivatives in a batch plan;
5. render the page from catalog + manifest;
6. produce a report with total, published, verified, failed and rollback details.

## Hidden Arquives Greys correction

For the Greys package, the current corrective target is:

```text
assets/species/greys-approved/original/v1/
assets/species/greys-approved/derived/v1/
assets/species/greys-approved/manifest.json
```

The approved Greys images must be reingested as originals. Existing lower-quality `q65`, thumbnail or interim files are derivatives or temporary transport artifacts unless their hash matches the approved original exactly.

## Acceptance criteria

A Greys or future Hidden Arquives asset batch is complete only when:

- 100% of approved originals exist in storage;
- every original hash matches the approval manifest;
- derivatives, if present, reference the original hash;
- the page references either originals or explicit derivatives according to the manifest;
- no visual slot points to an untracked draft;
- a report proves storage, hash and public URL validation;
- rollback is available for the rendered page.

## Reason

The previous manual publication flow proved that the site and operator can publish real assets, but it also exposed a quality regression: approved images were represented by lower-quality renditions.

This ADR prevents that class of error from recurring. The approved asset is the source of truth; derivatives are optional outputs, never replacements.
