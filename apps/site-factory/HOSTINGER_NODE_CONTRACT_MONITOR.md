# Monitor do contrato Hostinger Node

Este monitor acompanha diariamente o contrato oficial usado pelo futuro build Node.js por archive.

## Fontes oficiais

- `hostinger/api/openapi.json`;
- issue `hostinger/api#56`.

## Snapshot esperado

- OpenAPI `3.0.0`;
- API `1.23.0`;
- endpoint `POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive`;
- `operationId=hosting_createNodeJSBuildFromArchiveV1`;
- `application/json`;
- schema `Hosting.V1.NodeJs.CreateFromArchiveRequest`;
- campo obrigatório `archive` do tipo `string`;
- issue `#56` aberta.

## Comportamento

Quando o snapshot permanece igual, o relatório retorna:

- `status=unchanged-blocked`;
- `reviewRequired=false`;
- todas as barreiras externas em `false`.

Quando o contrato muda ou a issue fecha, o workflow:

1. gera um relatório sanitizado;
2. publica o artifact no GitHub Actions;
3. falha de forma controlada;
4. exige revisão humana e novo PR antes de qualquer mudança no executor.

## Segurança

O workflow:

- usa somente `contents: read`;
- consulta apenas fontes públicas oficiais;
- não usa `HOSTINGER_API_TOKEN`;
- não prepara request Hostinger;
- não executa POST;
- não inicia build remoto;
- não executa deploy;
- não altera DNS.

A execução diária ocorre no runner institucional `self-hosted / macOS / X64`.
