# MCP Brain v1 — Runtime Source Package

This directory versions the controlled source package for the live MCP Brain runtime used by ADA.

## Scope

This PR intentionally versions only the source needed to make the Imuni MCP v1 work auditable and reproducible:

- container build files;
- sanitized compose template that references runtime config files by path but does not include secrets;
- Imuni clinical-support tool module;
- Imuni smoke tests.

## Explicitly excluded

- `.env`;
- `/opt/api-dev-brain/config/*`;
- token values;
- `.bak` files;
- `__pycache__`;
- live registry JSON payloads with operational state;
- real clinical payloads.

## Runtime currently validated

- Namespace: `imuni.*`
- Tools: 8
- Mode: `draft_no_persist`
- Governance: `active_v1`
- Clinical writes: blocked
- Production writes: blocked
- Smoke test: passed after red flags negation patch v2

## Next step

Reconcile the rest of the MCP Brain runtime into source control in smaller, reviewable PRs instead of importing the whole VPS directory at once.
