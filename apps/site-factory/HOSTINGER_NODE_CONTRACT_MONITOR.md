# Monitor do contrato Hostinger Node

Este monitor acompanha diariamente o contrato oficial do endpoint de build Node.js por arquivo e a issue upstream `hostinger/api#56`.

## Fontes oficiais

- `hostinger/api/openapi.json`
- issue `hostinger/api#56`

## Baseline revisada em 2026-08-08

- OpenAPI `3.0.0`
- API global observada `1.30.0`
- endpoint `POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive`
- `operationId=hosting_createNodeJSBuildFromArchiveV1`
- `application/json`
- schema `Hosting.V1.NodeJs.CreateFromArchiveRequest`
- `archive` obrigatorio, tipo `string`, sem `format`
- issue `#56` aberta

## Regra de monitoramento

O gate e **fail-closed para mudancas materiais do endpoint monitorado** ou para mudanca do estado/numero da issue upstream.

Mudancas materiais incluem:

- OpenAPI major/spec incompatível
- remocao do endpoint
- mudanca de `operationId`
- mudanca do media type
- mudanca do schema `$ref`
- mudanca de obrigatoriedade/tipo/formato de `archive`
- fechamento ou substituicao da issue #56

A versao global `info.version` da API Hostinger e registrada como metadado. Um bump global isolado, sem mudanca material no endpoint monitorado, **nao falha o gate**. Isso evita falso positivo causado por alteracoes oficiais em outras areas da API.

## Estados

- `unchanged-blocked`: endpoint e issue permanecem no baseline
- `upstream-metadata-changed-blocked`: apenas metadado global mudou
- `review-required`: contrato relevante ou issue mudou; revisao humana obrigatoria

Em todos os estados o executor Hostinger Node permanece bloqueado ate haver decisao especifica.

## Seguranca

O workflow:

- usa somente `contents: read`
- consulta fontes publicas oficiais
- nao usa `HOSTINGER_API_TOKEN`
- nao prepara request Hostinger
- nao executa POST
- nao inicia build remoto
- nao executa deploy
- nao altera DNS
- roda no runner institucional `self-hosted / macOS / X64`
