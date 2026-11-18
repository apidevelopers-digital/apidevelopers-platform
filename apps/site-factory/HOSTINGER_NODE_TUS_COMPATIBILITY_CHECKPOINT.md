# Hostinger Node TUS — checkpoint de compatibilidade dry-run (2026-10-27)

Escopo: PR #737, branch `fix/site-factory-hostinger-node-tus-20261025` do `apidevelopers-platform`. Este checkpoint e complementar aos documentos existentes; nao concede autorizacao de producao.

## Contrato oficial conferido

- Fonte: https://github.com/hostinger/api/blob/main/openapi.json (`info.version` 2.4.3; OpenAPI 3.0.0, consulta de 2026-10-27).
- Build Node: `POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds`.
- Schema: `#/components/schemas/Hosting.V1.NodeJs.StartBuildRequest`.
- Para fonte `archive`, o corpo deve incluir `source_options.archive_path` correspondente ao caminho relativo do arquivo planejado. Nao presumir disponibilidade de `/nodejs/builds/from-archive`.
- O monitor preserva historico do endpoint legado como sinal de transicao; sua ausencia no OpenAPI nao pode ser ocultada.

## Evidencias fixadas no HEAD 3be4198742f561beb7517f5c3783e58be256769d

- Site Factory CI #190: success — https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40594808757
- Build Executor Preflight #90: success — https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40594808768
- Node Archive #91: success — https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40594808814
- Contract Monitor #172: failure — https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40594808920
- Testes relevantes: `test/hostinger-node-tus-plan-integration.test.mjs`, `test/hostinger-node-tus-nested-archive-regression.test.mjs`, `test/hostinger-node-contract-closed-issue-regression.test.mjs`, `test/run-hostinger-node-contract-monitor-signals.test.mjs`.

O monitor falhou com a revisao fail-closed ativa; o relatorio sanitizado completo do #172 ainda nao foi inspecionado aqui. Portanto, nao se declara inexistencia de drift adicional nem homologacao ponta a ponta em ambiente real.

## Bloqueios e criterio de conclusao

`writesEnabled=false`; `buildStartAllowed=false`; `remoteBuildStarted=false`; `productionExecutionAllowed=false`.
Nao realizar upload TUS, POST de build, merge, deploy ou alteracao de DNS. A revisao humana do contrato e obrigatoria, mesmo com CI funcional aprovado.

Proxima verificacao: ler o relatorio sanitizado do Contract Monitor #172 e conciliar seus sinais com o OpenAPI 2.4.3 e o classificador; documentar divergencias reais antes de qualquer alteracao do gate.
