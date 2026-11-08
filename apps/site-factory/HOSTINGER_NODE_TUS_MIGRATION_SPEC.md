# Hostinger Node TUS — migração (revisão 2026-10-28)

**Estado:** PR #737, branch `fix/site-factory-hostinger-node-tus-20261025`; desenvolvimento exclusivamente em dry-run, sem merge nem deploy.

## Contrato oficial

- Fonte: https://github.com/hostinger/api/blob/main/openapi.json. Formato OpenAPI `3.0.0`, `info.version=2.4.3` (verificado em 28/10/2026). A referência `2.3.0` de 26/10 é histórica.
- A Hostinger encerrou https://github.com/hostinger/api/issues/56 em 30/09/2026 e confirmou a remoção pública do endpoint `/nodejs/builds/from-archive`.
- Fluxo vigente: `POST /api/hosting/v1/files/upload-urls` para URL/credenciais temporárias; upload TUS 1.0.0 via `POST`/`PATCH` com offsets; depois `POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds`.
- Schema: `#/components/schemas/Hosting.V1.NodeJs.StartBuildRequest`. Campos obrigatórios: `node_version`, `app_type`, `root_directory`, `output_directory`, `build_script`, `source_type`, `source_options`. Alguns admitem `null`, mas não omissão. Para `source_type=archive`, `source_options.archive_path` aponta para arquivo relativo já presente no destino. Versões Node: 18, 20, 22, 24.

## Implementação confirmada

- Planejamento, protocolo e transporte TUS simulados em `src/hostinger-node-tus-*.mjs`, sem upload remoto.
- Serializador de corpo completo em `src/hostinger-node-start-build-dry-run.mjs`, integrado ao planejador e protegido por testes de caminhos e entradas inválidas.
- Classificador e monitor de contrato: `src/hostinger-node-upstream-drift.mjs`, `src/hostinger-node-contract-transition.mjs` e `src/run-hostinger-node-contract-monitor.mjs`.
- No HEAD `dc6f4a5`: Site Factory CI #192 e Executor Preflight #92 aprovados. Contract Monitor #174 consultou OpenAPI e issue, gerou relatório sanitizado e falhou somente no gate humano (`exit 2`).

## Revisão pendente

O `reviewRequired=true` da transição é **intencional e permanente até decisão explícita**. Não corrigir o monitor removendo o gate. O JSON integral do relatório #174 existe como artefato, mas **não foi extraído e conferido** nesta revisão; valores reais de `changeSignals` não devem ser presumidos.

1. Ler o resumo/artefato do #174 e reconciliar sinais com OpenAPI 2.4.3 e issue #56.
2. Conferir testes negativos ponta a ponta, evitando duplicações.
3. Registrar evidências finais e decisão humana sobre o bloqueio.

## Segurança

`writesEnabled=false`; `buildStartAllowed=false`; `remoteBuildStarted=false`; `productionExecutionAllowed=false`. Não expor `X-Auth`, `X-Auth-Rest`, tokens ou URLs temporárias. Build real pode sobrescrever o site: exige backup, conferência do destino e autorização específica. Merge, deploy, DNS, upload TUS e POST de build real permanecem proibidos. Runner esperado: `self-hosted`, `macOS`, `X64`.
