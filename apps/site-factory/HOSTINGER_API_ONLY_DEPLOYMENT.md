# Hostinger API-only deployment

Status: prepared for review. No deployment is implied by the presence of this file.

## Boundary

The preview deployment path is API-only:

```text
GitHub workflow_dispatch
→ igor-mac-runner
→ deterministic source archive
→ Hostinger API
→ build polling and sanitized logs
→ public HTTPS probe
→ GitHub artifact evidence
```

Panel automation, File Manager clicks, UniDesk, SSH, FTP and undocumented internal endpoints are not permitted fallbacks.

## Target

- Account username: `u242521810`
- Domain: `preview-apidevelopers.apidevelopers.digital`
- Runtime: Node.js 22
- Application type: Vite
- Package manager: npm
- Output directory: `dist`

## Secret

Create the GitHub Actions secret below at repository or organization level:

```text
HOSTINGER_API_TOKEN
```

Never place the token in workflow inputs, repository files, issues, pull requests or chat.

## Execution gates

The workflow defaults to `preflight`, which performs no Hostinger write.

A real build requires all of the following:

1. workflow input `mode=apply`;
2. `approved_sha` exactly equal to the workflow commit SHA;
3. workflow input `approval=IGOR_APROVA_HOSTINGER_DEPLOY`;
4. `HOSTINGER_API_TOKEN` available as a GitHub Actions secret;
5. execution on `igor-mac-runner` labels `self-hosted`, `macOS`, `X64`.

The apply operation creates one Node.js build through the public Hostinger endpoint and then polls the documented build and log endpoints. DNS is not changed by this workflow.

## Transport

`multipart` is the preferred transport because the live Hostinger validator requires the `archive` field to be a file. The workflow runs from the institutional self-hosted runner to avoid dependence on hosted-runner network behavior.

`documented-json-filename` is retained only as a controlled diagnostic option matching the current OpenAPI media type. It must not be used as an automatic fallback.

## Evidence

Every run uploads a JSON artifact containing:

- exact source SHA;
- target domain and username;
- archive name, size and SHA-256;
- selected transport;
- HTTP status and correlation ID;
- build UUID and terminal state;
- sanitized build logs;
- HTTPS status and response-body hash.

Archive contents, authorization headers and token values are excluded or redacted.
