# MCP Brain runtime hotfix — Juri DataJud

Date: 2026-11-25 UTC
Scope: `apps/mcp-brain-v1`
Risk: R4 / runtime hotfix
Status: hotfix applied in the live VPS/container, not yet consolidated into the official image/deploy flow.

## Summary

The live MCP Brain runtime was hotfixed to allow the validated Juri DataJud flow to be used through MCP tools.

Validated tools:

- `juri.datajud.request`
- `juri.datajud.job.get`

The pre-existing `juri.datajud.status` tool still returns the older/direct MCP implementation and must be reconciled later to use the same gateway bridge.

## Validated path

```text
MCP Brain
→ mcp.apidevelopers.digital /mcp/call
→ gateway.apidevelopers.digital /v1/plugins/juri/call
→ unico.sitedauni.com /juri/datajud/*
→ DataJud bridge v3
```

The gateway remains the only layer that holds the `unico.sitedauni.com` API key. No Unico secret was committed to MCP runtime or GitHub.

## Hotfix actions applied

1. Appended an incremental bridge to the live host file:

```text
/opt/api-dev-brain/apps/mcp-brain-v1/app/main.py
```

2. Created host backup:

```text
/opt/api-dev-brain/apps/mcp-brain-v1/app/main.py.bak.20261125010900
```

3. Confirmed the live Docker container did not read the host file directly. The container uses the bundled file at:

```text
/app/app/main.py
```

4. Backed up the container file and copied the host patched file into the running container:

```sh
docker exec mcp-api sh -lc 'cp /app/app/main.py /tmp/main.py.bak.$(date +%Y%m%d%H%M%S)'
docker cp /opt/api-dev-brain/apps/mcp-brain-v1/app/main.py mcp-api:/app/app/main.py
docker restart mcp-api
```

5. Confirmed health after restart:

```json
{
  "ok": true,
  "service": "api-dev-brain-01",
  "operator": "ada-enterprise-operator-v2"
}
```

## Runtime validation

### `juri.datajud.request`

Confirmed through the MCP connector.

Observed:

```json
{
  "httpStatus": 202,
  "runtime": "unico.sitedauni.com",
  "bridge": "juri-datajud-http-intercept-bridge-v3",
  "plugin": "juri",
  "operation": "juri.datajud.request",
  "dryRun": true,
  "acceptedByContract": true,
  "secretExposed": false,
  "rawResultIncluded": false
}
```

### `juri.datajud.job.get`

Confirmed through the MCP connector.

Observed:

```json
{
  "httpStatus": 200,
  "runtime": "unico.sitedauni.com",
  "bridge": "juri-datajud-http-intercept-bridge-v3",
  "status": "pending_retry",
  "classification": "rate_limited",
  "secretExposed": false,
  "rawResultIncluded": false
}
```

Note: the upstream TRF1 DataJud result returned `rate_limited` / `pending_retry`. That is an upstream DataJud response, not an MCP Brain failure.

## Known issues

1. The official `MCP API bootstrap rebuild` workflow failed on 2026-11-25 with exit code `255` during SSH/rebuild.
2. The live runtime file `app/main.py` is much larger than the GitHub version and has not been fully imported into GitHub.
3. The Docker image does not use the host `app/main.py` as a live-mounted source file. A plain container recreate from the image can lose this hotfix.
4. `juri.datajud.status` still uses the older/direct implementation and should be reconciled to the gateway bridge.
5. The previous patch to `tools_inventory_entrypoint.py` exists on the host but did not affect the live connector path.

## Operational rule

Do not remove or recreate the live `mcp-api` container/image until the patched runtime is consolidated into the official Docker build/deploy path.

A safe future consolidation should:

1. Import or reconcile the live `/opt/api-dev-brain/apps/mcp-brain-v1/app/main.py` into GitHub.
2. Fix the official SSH/rebuild workflow.
3. Build a new image containing the DataJud MCP bridge.
4. Recreate `mcp-api` from that image.
5. Validate:
   - `/health`
   - `/mcp/tools?full=true`
   - `juri.datajud.request`
   - `juri.datajud.job.get`
   - `juri.datajud.status`
