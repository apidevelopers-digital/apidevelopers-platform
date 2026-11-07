# ADA Asset Engine v1

> Status: draft institutional spec
> Owner: API Developers.digital
> Initial consumer: Hidden Arquives / Hidden Archives
> Scope: assets, media, injection, validation and multi-channel publication

## 1. Purpose

ADA Asset Engine is the institutional media and asset pipeline for API Developers.digital.

It must not be a Hidden Arquives-only tool, a Raiden-only tool, or a manual upload utility. It must be a reusable engine capable of ingesting, cataloging, processing, publishing, validating and injecting high-quality assets across institutional properties.

## 2. Naming and reanchoring

Correct terms:

- Active property: Hidden Arquives / Hidden Archives.
- Root domain: hiddenarquives.tech.
- Hostinger root confirmed: /home/u242521810/domains/hiddenarquives.tech/public_html.
- Subdomains are published as folders under that root, such as greys, aliens, annakuni, library, archives and login.
- Raiden is not the primary asset name. Raiden is an operational/automation context and can be a consumer or adapter of this engine.

## 3. Platform anchor

Initial institutional location:

- Repository: apidevelopers-digital/apidevelopers-platform.
- Runtime: gateway.apidevelopers.digital.
- Proposed modules:
  - docs/asset-engine/
  - packages/asset-engine/
  - apps/asset-api/
  - apps/asset-worker/

Hidden Arquives becomes an initial consumer, not the only purpose of the engine.

## 4. Core flow


```text
asset input
    ↓
asset_id and hash
    ☓
 processing and variants
    ☓
 storage publish
    ↓
manifest generation
    ↓
 injection into targets
    ↓
public validation
    ☓
 report and audit
```

## 5. Asset types

v1 must support:

- Image: PNG, JPDG, WEBP, AVIF.
- Video: MP4, WebM, social/vertical derivatives.
- Document: PDF and downloadable files.
- Brand: logos, favicons, color tokens and approved font references.
- Campaign: social creatives, legends, CTAs, media kits.
- Telons / VNNOX: screen-ready renditions and packages.
- WhatsApp: safe media links, documents, images and videos for drafts and approved sending.
- Email: attachments, public links, tracked downloads and images.

## 6. Core operations

### 6.1 Ingest

Ingest must accept:

- Direct uploads.
- Files from ChatGPT conversation artifacts when available to the operating environment.
- URLs from public sources.
- IA-generated images after human approval.
- Bulk packages for projects.

Ingest must create an asset record and calculate hashes before publication.

### 6.2 Process

Processing must be pluggable. Image v1 should include:

- sha1 or sha256 fingerprint.
- original preservation.
- size and dimension extraction.
- optimized WEBP.
- AEIF/AVIF where supported.
- PNG fallback when needed.
- hero, card, thumb and mobile variants.

### 6.3 Publish

Initial publish adapters:

- HostingerStaticAdapter for Hidden Arquives/Hidden Archives and other Hostinger static sites.
- CDN/ObjectStorageAdapter for future R2/S3/Cloudflare/CDN providers.
- WhatsAppMediaAdapter for sending-ready media and links.
- EmailMediaAdapter for attachments and public links.
- VnnoxMediaAdapter for media packages and telao publication flows.

### 6.4 Inject

Injection must not be free-text HTML editing. In va, injection should update target slots.

Examples:

- hiddenarquives/greys/hero.
- hiddenarquives/greys/gallery.
- whatsapp/campaigns/main-image.
- email/attachments/download-link.
- vnnox/solutions/brand-loop.

In the site context, the safest model is to:


```text
catalog.json + template -> rendered HTML
```

not random regex substitution in HTML.

### 6.5 Verify

Verification must include:

- storage exists.
- remote size matches.
- remote hash matches.
- public HTTP status is 200.
- content-type is matched to the asset type.
- HTML does not contain broken or corrupted URL patterns.
- page is able to reference the public asset.
- report is persisted.

## 7. Asset states

```text
draft
uploaded
processed
approved
published
verified
failed
archived
rejected
```

No public injection must occur without approved or otherwise audited status.

## 8. Storage strategy

### 8.1 Near-term

Near-term Hidden Arquives target:


```text
/home/u242521810/domains/hiddenarquives.tech/public_html/assets/...
```

Reason: the static site and its subdomains are already anchored there.

### 8.2 Scale target

Store heavy originals and large media outside GitHub. Preferred future providers:

- Cloudflare R2.
-S3/compatible object storage.
- CDN frontdoor.
- Dedicated media library when required.

GitHub should store code and catalogs. It should not become an unbounded binary dump for hundreds of thousands of images.

## 9. API draft

```text
POST /v1/assets
POST /v1/assets/{id}/process
POST /v1/assets/{id}/publish
POST /v1/assets/{id}/inject
GET  /v1/assets/{id}/verify
GET  /v1/projects/{id}/manifest
GET  /v1/assets?tenant=...&project=...
POST /v1/injections/{id}/rollback
```

## 10. Minimum asset record


```json
{
  "asset_id": "ast_hidden_greys_hero_4b0b699b",
  "tenant": "hiddenarquives",
  "project": "greys",
  "type": "image",
  "role": "hero",
  "status": "verified",
  "sha1": "4b0b699b8716e15e35d6a0461b86f5017c01647a",
  "public_url": "https://hiddenarquives.tech/assets/species/greys/greys-hero-4b0b699b.webp",
  "storage": {
    "provider": "hostinger",
    "remote_path": "/home/u242521810/domains/hiddenarquives.tech/public_html/assets/species/greys/..."
  },
  "usage": [
    "greys.hiddenarquives.tech",
    "hiddenarquives-whatsapp-profile"
  ]
}
```

## 11. Hidden Arquives va target

### 11.1 Hostinger structure


```text
hiddenarquives.tech
public_html/
  assets/
  greys/
  aliens/
  annaki/  
  library/
  archives/
  login/
```

### 11.2 Initial package: greys

The first implementation should not try to solve all subdomains at once. It should support one verified package:


```text
tenant: hiddenarquives
project: greys
destinations: 
  - hiddenarquives.tech/assets/species/greys
  - greys.hiddenarquives.tech
injection slots:
  - hero
  - gallery
verification:
  - SFTP reverse check
  - HTTP public check
  - HTML link check
```

## 12. Adapters

### 12.1 HostingerSiteAdapter

Responsibilities:

- Know tenant roots and safe publication paths.
- Publish files via SFTP/API where available.
- Do not use free-form absolute paths without root allowlist.
- Reverse-verify size and hash.
- Publish manifests and reports.

### 12.2 WhatsAppMediaAdapter

Responsibilities:

- Create send-ready media links.
- Optimize media for WhatsApp channel constraints.
- Create draft messages only by default.
- Real sending requires explicit approval through the institutional message send flow.

### 12.3 EmailMediaAdapter

Responsibilities:


- Create attachments or public links.
- Validate file size and sender constraints.
- Create draft only by default.
- Real sending requires approval.

### 12.4 VnnoxMediaAdapter

Responsibilities:


- Prepare media packages for screens.
- Publish only through VNNOX real-action approval flows.
- Keep SHA, manifest and rendition reports.

## 13. Operational rules

- No manual HTML regex updates for scale. Use catalog + template + render.
- No fixed public filenames for mutable assets. Use content hash fingerprinting.
- No claim of publish until storage, HTTP and injection validation pass.
- No secrets in reports, logs or manifests.
- No publication destroys or overwrites assets without audit.
- Rollback must be supported for injection targets.

## 14. Report format

A successful publication must return:

```json
{
  "ok": true,
  "tenant": "hiddenarquives",
  "project": "greys",
  "assets_total": 10,
  "assets_published": 10,
  "assets_verified": 10,
  "http_200": 10,
  "html_updated": true,
  "html_verified": true,
  "rollback_available": true
}
```

## 15. First implementation plan

1. Create `docs/asset-engine/` as authority docs.
2. Create `packages/asset-engine/` for core types and manifests.
3. Create `media/catalogs/hiddenarquives/greys.json` as the first consumer catalog.
4. Create asset processor for hash naming and optional image optimization.
5. Create HostingerSiteAdapter for Hidden Arquives static publication.
6. Create greys page renderer from catalog + template.
7. Run on a 4-image smoke pack.
8. Run on the 10-image greys pack.
9. Only then expand to aliens and other Hidden Arquives pages.

