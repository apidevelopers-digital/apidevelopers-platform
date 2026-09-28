# Mitra MCP v1 — legal contract-only public probe milestone

**Status:** confirmed  
**Date:** 2026-09-28  
**Repository:** `apidevelopers-digital/apidevelopers-platform`  
**Base branch:** `main`  
**Runtime deploy branch:** `deploy/hostinger-gateway-runtime`

## Scope

This milestone records the public validation of Mitra MCP v1 read-only routes after the legal contract-only capabilities were registered and the public saved-token probe was aligned with the current `/capabilities` payload.

Validated public read-only routes:

- `GET /v1/mitra/mcp/status`
- `GET /v1/mitra/mcp/capabilities`

Validated legal contract-only capabilities:

- `mitra.buscar_jurisprudencia`
- `mitra.pesquisar_fontes_oficiais`
- `mitra.buscar_processo`

This milestone does not include real legal adapter execution, external Lex/Mitra connections, database changes, DNS changes, manual Hostinger changes, or write-capable operations.

## Evidence

| Evidence | Result |
|---|---|
| Legal capabilities PR `#654` | merged into `main` |
| Probe diagnostics PR `#656` | merged into `main` |
| Probe diagnostic shell hardening PR `#659` | merged into `main` |
| Capabilities probe alignment PR `#660` | merged into `main` |
| Final probe workflow run `#17` | completed with `success` |
| Final probe run ID | `36399354544` |
| Final probe commit | `9b2f90db53aef1a2d83534e319c28295dcd54523` |
| Final probe started at | `2026-09-28T08:46:15Z` |
| Final probe completed at | `2026-09-28T08:48:16Z` |

## Outcome

The Mitra MCP v1 public read-only base is considered complete for this stage.

Confirmed:

- Public `/status` route validated.
- Public `/capabilities` route validated.
- Saved MCP v1 read token path validated.
- Runtime deploy SHA path validated by the saved-token probe.
- Legal contract-only capabilities are visible to the public MCP capabilities probe.
- The previous `unexpected_service_/v1/mitra/mcp/capabilities_none` probe mismatch was resolved by aligning the probe with the actual capabilities payload contract.

## Safety boundaries preserved

- No real legal adapter execution was enabled.
- No Lex/Mitra external integration was connected.
- No database access was enabled.
- No raw SQL was enabled.
- No write-capable adapter was enabled.
- No secrets were exposed.
- No DNS or manual Hostinger operation was performed as part of this milestone.

## Current readiness

| Area | Readiness |
|---|---:|
| Mitra MCP v1 public read-only base | 100% |
| Public legal contract-only capabilities | 100% |
| Real executable legal adapters | 65–70% |

## Next recommended step

Prepare a separate PR for the first real read-only legal adapter execution stub, keeping it non-writing, non-SQL, auditable, and gated by tests/probes before any external connection is enabled.
