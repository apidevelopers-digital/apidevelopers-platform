# API Developers.digital Platform

Official source of truth for the API Developers.digital technology platform.

## Canonical product source

The repository is the official source of truth. Chat attachments, `sandbox:` files and local copies are not canonical.

- [Commercial Catalog and Automation Matrix V1](CATALOGO_COMERCIAL_E_MATRIZ_DE_AUTOMACAO_V1.md)
- [Complete normative specification](docs/CATALOGO_COMERCIAL_E_MATRIZ_DE_AUTOMACAO_V1.md)

All product, plan, automation, billing and launch decisions must be committed here before they are treated as implemented or approved.

## Mission

Build and operate a global, multi-tenant platform of APIs, engines and reusable technology services for `uni.` and external customers.

## Ecosystem

- **API Developers.digital**: technology platform, APIs, engines, SDKs, infrastructure and developer tooling.
- **`uni.`**: commercial platform at `sitedauni.com`, focused on software, media, AI, integrations, WhatsApp and customer-facing products.

## Engineering principles

- multi-tenant by default
- versioned contracts
- security and auditability
- internationalization
- observability
- dry-run and approval gates for sensitive actions
- clear separation between infrastructure and products

## Target structure

```text
apps/
engines/
services/
packages/
openapi/
tests/
docs/
.github/
```

## Status

Global foundation in progress. Commercial sale remains blocked until the full automated journey and launch gates are validated.
