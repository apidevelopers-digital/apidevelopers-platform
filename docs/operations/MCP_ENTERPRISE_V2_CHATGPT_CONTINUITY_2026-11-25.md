# MCP Enterprise v2 ChatGPT continuity — 2026-11-25

## Status

Confirmed on 2026-11-25: `ADA Enterprise MCP Brain v2` was connected to ChatGPT as a custom MCP plugin using the endpoint:

```text
https://mcp.apidevelopers.digital/mcp
```

The plugin is active/installed in the ChatGPT workspace with dynamic tools enabled.

## Confirmed execution path

The following tool executed successfully from ChatGPT through the MCP plugin:

```text
juri.datajud.status
```

Execution mode:

```json
{"dry_run": true}
```

Confirmed result summary:

- HTTP 200 returned by the gateway/runtime path.
- `configured: true`
- `acceptedByContract: true`
- `secretExposed: false`
- `rawResultIncluded: false`
- No DataJud process consultation was executed by this status check.

Observed route:

```text
ChatGPT
→ ADA Enterprise MCP Brain v2
→ https://mcp.apidevelopers.digital/mcp
→ gateway.apidevelopers.digital
→ unico.sitedauni.com
→ juri-datajud-http-intercept-bridge-v3
```

## OAuth / authorization status

Confirmed:

- OAuth discovery works for the MCP endpoint.
- `/.well-known/oauth-protected-resource` advertises the protected resource as:
  - `https://mcp.apidevelopers.digital/mcp`
- OAuth authorization completed in ChatGPT.
- The exposed setup connect code was rotated after successful plugin installation.
- The rotated connect code was installed in the VPS host/runtime file and container file without printing the new value.
- `/health` returned OK after rotation.

Do not store or commit connect codes, signing secrets, admin tokens, private keys, `.env` values, or bearer tokens.

## Runtime notes

The working MCP endpoint is:

```text
https://mcp.apidevelopers.digital/mcp
```

The root URL remains a public landing page:

```text
https://mcp.apidevelopers.digital/
```

Operational finding: `POST /` continued returning `405` from the landing path during testing. The validated MCP path is `/mcp`; use that path for ChatGPT MCP plugin configuration.

## Initial dynamic tools

Initial exposed tools were intentionally limited to the safe DataJud set:

```text
juri.datajud.status
juri.datajud.request
juri.datajud.job.get
```

Current validated tool:

```text
juri.datajud.status
```

## Pending follow-up

1. Expand the dynamic tool catalog gradually, grouped by operational domain.
2. Keep destructive or external-effect actions behind dry-run and explicit approval gates.
3. Prefer adding small tool groups first:
   - DataJud read/status tools
   - Zuni read/status diagnostics
   - VNNOX read/status diagnostics
   - GitHub read-only inventory
   - Hostinger read-only inventory
4. Promote source patches from VPS runtime into the canonical repository before relying on rebuilds.
5. Do not rotate the OAuth signing secret unless intentionally invalidating current plugin sessions.

## Security boundary

Sensitive actions still require explicit approval before real execution, including:

- deploy
- merge
- publication
- DNS changes
- WhatsApp/email/social sending
- VNNOX screen actions
- server restarts
- destructive filesystem/database actions
- billing or financial actions

## Operator note

This record is a continuity checkpoint only. It does not claim a merge, deploy, release, or production promotion. It records the observed working state of the ChatGPT MCP plugin integration and the DataJud dry-run status validation.
