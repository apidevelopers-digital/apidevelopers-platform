# Mitra Professional — Canonical Login and Environment Note

**Date:** 2026-09-14  
**Status:** operational continuity note  
**Scope:** Mitra Professional frontend, login, and deployment environments

## Canonical product framing

The current product track is **Mitra Professional**.

Do not describe this front as a Uni product track. Uni/Zuni/Unico are relevant only because they are part of the existing shared identity/admin/login ecosystem.

## Canonical Mitra environments

The correct Mitra environments are:

- **Primary / production surface:** `mitra.apidevelopers.digital`
- **Preview / development surface:** `mitra-preview.apidevelopers.digital`

The two surfaces should be separated operationally:

- `mitra.apidevelopers.digital` should run the stable/production Mitra track.
- `mitra-preview.apidevelopers.digital` should be used for development, testing, and backend/frontend adjustments before promotion.

## Shared login context

Igor uses the existing shared admin login ecosystem that already works for the Zuni/Uni environment.

Operational identifier for testing:

- `igor@sitedauni.com`

The password must not be asked for, saved, logged, committed, or documented.

The Mitra implementation must authenticate this user through the shared identity ecosystem and must grant access to the Mitra product without mistaking Mitra for Uni.

## Product binding rules

Correct Mitra binding:

- product: `product:mitra`
- agent: `mitra.professional`
- preview host: `mitra-preview.apidevelopers.digital`
- primary host: `mitra.apidevelopers.digital`

The existing Uni/Zuni/Unico identity backend may be used as the identity source, but the resulting Mitra session must be bound to `product:mitra`, not `product:uni-co`.

## Operational goal

The goal is to make Mitra work as a usable product on both surfaces:

1. User can open `mitra.apidevelopers.digital` and log in.
2. User can open `mitra-preview.apidevelopers.digital` and log in.
3. Login uses the shared identity/admin ecosystem already used by Igor.
4. Mitra sessions are bound to `product:mitra`.
5. The frontend accesses Gateway Mitra capabilities.
6. Assistant/OpenAI, DataJud, Jurimetrics, jurisprudence, Documents, and Veritas are validated inside the authenticated Mitra surface.

## Notes for next work

Do not materialize only the preview and do not mistake the Uni/Zuni/Unico identity system for the Mitra product itself.

Keep these boundaries clear:

- **Identity source:** shared Zuni/Uni/Unico ecosystem.
- **Product:** Mitra.
- **Preview environment:** `mitra-preview.apidevelopers.digital`.
- **Primary environment:** `mitra.apidevelopers.digital`.
