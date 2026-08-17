# API Gateway — Production Observability

**Status:** vigente  
**Scope:** read-only observability for the production Gateway path.

## Objective

Continuously detect whether the API Gateway production path is healthy without
performing Hostinger mutations, DNS changes, domain changes, deploys or Trust
activation.

The monitor distinguishes two public targets:

- Hostinger Node/Git parent app:
  `https://dodgerblue-heron-996886.hostingersite.com/ready`
- Production domain:
  `https://gateway.apidevelopers.digital/ready`

## Workflow

Workflow:

`.github/workflows/api-gateway-production-observability.yml`

Triggers:

- every 30 minutes;
- manual `workflow_dispatch`.

Runner:

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

The workflow requires no Hostinger token and has only:

```yaml
permissions:
  contents: read
```

## Readiness contract

A target is healthy only when all of these conditions are true:

- HTTP response is successful;
- `service == "api-gateway"`;
- `status == "ready"`;
- a `persistence` check exists;
- `persistence.critical == true`;
- `persistence.status == "ok"`;
- `persistence.code == "readable"`.

## Classification

The monitor emits one sanitized JSON report with one of these classifications:

- `healthy`: parent app and production domain are both healthy;
- `runtime_or_upstream_unavailable`: parent and production both fail;
- `production_domain_routing_regression`: parent is healthy but production fails;
- `parent_hostname_regression_or_aliasing_anomaly`: production is healthy but the
  Hostinger parent hostname fails.

The report includes HTTP status and latency for each target and is retained as a
GitHub Actions artifact for 14 days.

## Security boundary

This monitor is intentionally read-only.

It must not:

- use `HOSTINGER_API_TOKEN`;
- call Hostinger mutation endpoints;
- create or delete parked domains;
- alter DNS;
- upload archives;
- trigger production deploy;
- alter environment variables;
- activate Trust.

Trust remains a separate governed action with its own review and explicit
approval immediately before execution.

## Operational interpretation

A red scheduled run is evidence that production needs review. It is not
permission to self-heal or mutate production automatically.

If the parent app is healthy and the production domain fails, first investigate
the domain binding/parked-domain relationship.

If both fail, investigate the Node/Git runtime, Hostinger build/runtime health
and upstream availability.

The canonical production deployment remains:

```text
GitHub main
  -> deploy/hostinger-gateway-runtime
  -> Hostinger Git integration
  -> Hostinger Node.js Web App
  -> parked_domain gateway.apidevelopers.digital
```
