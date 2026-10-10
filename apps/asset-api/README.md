# ADA Asset API

HTTP/API entrypoint for ADA Asset Engine.

## Status

Scaffold only. No production routes are active in this draft.

## Planned routes

```text
POST /v1/assets
POST /v1/assets/:id/process
POST /v1/assets/:id/publish
POST /v1/assets/:id/inject
GET  /v1/assets/:id/verify
GET  /v1/projects/:id/manifest
```

## Runtime target

Initial runtime candidate: `gateway.apidevelopers.digital`.
