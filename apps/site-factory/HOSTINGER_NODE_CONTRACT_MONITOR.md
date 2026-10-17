# Monitor do contrato Node.js Hostinger — revisão v2

## Referências oficiais
- OpenAPI público: `hostinger/api` (`openapi.json`, versão observada `2.1.0`).
- [Issue oficial #56](https://github.com/hostinger/api/issues/56): encerrada em 30/09/2026.
- Endpoint antigo `/nodejs/builds/from-archive` removido do contrato público.

## Contrato monitorado (sem executar)
1. `POST /api/hosting/v1/files/upload-urls` — obter URL temporária para upload TUS.
2. `GET /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/settings/from-archive` — inspecionar configurações do arquivo por `archive_path`.
3. `POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds` — criar build com `source_type=archive` e `source_options.archive_path`.

O monitor verifica presença, IDs de operação, esquemas e campos obrigatórios, além do status da issue. Mudanças inesperadas exigem revisão humana (`exit 2`); desvio isolado de `info.version` continua informativo.

## Segurança / escopo
O monitor apenas lê snapshots OpenAPI/issue e gera relatório sem segredos. **Não** usa token Hostinger, faz POST, envia ZIP, inicia build, faz deploy nem altera DNS.

O executor histórico não foi migrado nesta correção e **continua bloqueado**, mesmo se o monitor passar. Alteração de executor ou produção exige PR específico e aprovação explícita.

## Validação
`node --test apps/site-factory/test/hostinger-node-contract-monitor.test.mjs` (a partir da raiz) — 9 cenários locais passando. Revisar workflow CI antes de promover.
