# @apidevelopers/portal-projector-http

Adaptador HTTP abstrato, somente leitura, para a API institucional do Portal.

## Contrato

O pacote não abre servidor e não possui credenciais próprias. Ele recebe por injeção:

- `readApi`
- `authenticate(headers, request)`
- `authorize(identity, context)`

A fachada retornada expõe somente:

- `handle(request)`
- `basePath`
- `mutationAllowed: false`

## Rotas

- `GET /v1/portal/snapshot`
- `GET /v1/portal/summary`
- `GET /v1/portal/records`
- `GET /v1/portal/records/:institutionalType/:institutionalId`
- `GET /v1/portal/versions`

Parâmetros suportados:

- `commit`
- `institutionalType`
- `offset`
- `limit`

## Segurança

- somente `GET`;
- autenticação e autorização obrigatórias;
- nenhuma referência ao publisher;
- erros internos e segredos não são expostos;
- respostas usam `cache-control: private, no-store`;
- snapshot e resumo podem incluir `x-source-commit` e `etag`.

## Limites

O pacote não fornece socket, servidor, TLS, CORS, rate limit, identidade, política de autorização, tenant, telemetria, persistência, release ou deploy.
