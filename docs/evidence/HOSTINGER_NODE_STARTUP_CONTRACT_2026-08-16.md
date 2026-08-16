# Hostinger Node.js startup contract — 2026-08-16

Status: correction prepared in branch `fix/hostinger-listen-startup-guard-20260816`

Scope: `API Gateway` managed runtime on Hostinger Node.js hosting.

## Confirmed failure

The first GitHub-connected Hostinger deploy failed at runtime with:

```text
App did not call listen() within 3 seconds.
```

The GitHub connection, branch selection, repository root and Node 22 deployment path were already functional. The failure was the PaaS startup contract.

## Root cause

The managed Hostinger artifact generator packaged:

```json
"start": "node src/operational-server.mjs"
```

`operational-server.mjs` is a reusable runtime module and only executes its local `main()` path when `isDirectExecution()` is true. The Hostinger PaaS loader is not guaranteed to satisfy that detection, so no listener was opened in the required startup window.

## Correction

The managed artifact now uses a dedicated PaaS adapter:

```text
src/hostinger-entry.mjs
    ↓
startOperationalGateway()
    ↓
listen(process.env.PORT | internal runtime default)
```

The managed `package.json` and release manifest point to `src/hostinger-entry.mjs` rather than directly to `operational-server.mjs`.

## Regression guardrail

`managed-hosting-artifact.test.mjs` must verify:

- the generated `src/hostinger-entry.mjs` exists;
- `npm start` points to it;
- the release manifest entrypoint points to it;
- the adapter calls `startOperationalGateway()` and registers shutdown.

## Institutional lesson

For Hostinger Node.js applications, a reusable runtime module should not be used directly as the PaaS entrypoint when its startup is guarded by direct-execution detection. Use an explicit PaaS adapter that opens the listener immediately.

## Current progress

- GitHub → Hostinger repository connection: confirmed.
- Hostinger Node 22 app creation: confirmed.
- First GitHub-connected build: completed, runtime failed with 503.
- Startup cause: confirmed.
- Source correction: prepared in working branch.
 - Merge, runtime republication, Hostinger redeploy and production domain swap: pending separate validation/approval.

## Operator naming

The governed GPT operator is referred to as `uni.co operador` in lowercase. It is the governed write point used by ADA for controlled external operations; it is not the same thing as GitHub Actions.
