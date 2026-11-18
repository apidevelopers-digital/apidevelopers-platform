# Monitor do contrato Hostinger Node.js — revisão v2

## Fontes de autoridade

- OpenAPI público: `hostinger/api/openapi.json` (baseline observado: `openapi 3.0.0`, `info.version 2.1.0`).
- [Issue oficial #56](https://github.com/hostinger/api/issues/56): encerrada em 30/09/2026.
- Endpoint legado `/nodejs/builds/from-archive`: ausente no contrato público atual.

## Fluxo oficial observado (leitura de contrato somente)

1. `POST /api/hosting/v1/files/upload-urls`: fornecer URL temporária para upload TUS.
2. `GET /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/settings/from-archive`: inspecionar configurações do arquivo por `archive_path`.
3. `POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds`: iniciar build com `source_type=archive` e `source_options.archive_path`.

O monitor compara rotas, IDs de operação, tipos de mídia, referências de esquema e os conjuntos **exatos** de campos obrigatórios de upload e build. A adição ou remoção de campo obrigatório dispara revisão humana. Também confere número e estado da issue oficial.

## Estados e bloqueios

- `unchanged-blocked`: contrato de referência inalterado.
- `upstream-metadata-changed-blocked`: mudou apenas `info.version`, sem alteração material no fluxo.
- `review-required`: mudança material identificada; gate *fail-closed* (`exit 2` no runner).

**Todos os estados mantêm o executor de deploy bloqueado.** Aprovação desta correção do monitor não autoriza publicação Node.js nem migração automática do executor histórico.

## Segurança

Este monitor consulta somente OpenAPI e issue públicos e produz evidência sanitizada. Não utiliza token Hostinger, não envia arquivos, não executa requisições POST, não inicia builds, não faz deploy e não altera DNS.

A execução da suíte depende do runner institucional `self-hosted / macOS / X64`. Mudanças no executor, em produção ou em DNS exigem revisão separada e autorização explícita.

## Testes e evidência

A partir da raiz do repositório:

```sh
node --test apps/site-factory/test/hostinger-node-contract-monitor.test.mjs
```

A suíte possui **12 cenários de regressão**, incluindo novas exigências obrigatórias em upload e build e rejeição de evidências ausentes. Os checks do GitHub Actions devem ser revalidados no SHA definitivo deste PR antes de promover.
