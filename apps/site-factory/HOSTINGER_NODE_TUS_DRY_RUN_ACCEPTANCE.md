# Hostinger Node TUS — matriz de aceitação dry-run (2026-10-28)

Escopo: PR #737, branch `fix/site-factory-hostinger-node-tus-20261025`. Sem autorização de produção.

| Critério | Estado | Evidência / limite |
|---|---|---|
| OpenAPI vigente | Confirmado | Hostinger 2.5.1; POST `/nodejs/builds`; schema `Hosting.V1.NodeJs.StartBuildRequest`. |
| Serialização | Confirmado nos testes | Sete campos obrigatórios e fixture 2.5.1 offline. |
| Paridade archive_path | Confirmado nos testes | Planejador e serializador rejeitam mismatch. |
| Transporte TUS | Parcial | Simulação e testes offline; sem upload remoto homologado. |
| CI | Confirmado | Site Factory CI #199 aprovado em `90fd904`. |
| Monitor | Bloqueio esperado | Monitor #181 publica sete indicadores true; gate fail-closed retorna 2. |
| Aceitação final | Pendente | Revisão humana formal; CI não equivale a aceite de produção. |
| Produção | Bloqueada | Sem merge, deploy, upload ou POST de build. |

## Evidências de drift (Monitor #181)

`legacyEndpointMissing=true`, `currentArchiveFlowDocumented=true`, `contractChanged=true`,
`apiVersionChanged=true`, `issueChanged=true`, `officialIssueClosed=true`, `reviewRequired=true`.

https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40693348359

## Decisão

Compatibilidade estrutural offline verificada no CI; revisão humana ainda pendente.
Não remover o bloqueio fail-closed para tornar o workflow verde.
Não declarar homologação ponta a ponta real.

Manter `writesEnabled=false`, `buildStartAllowed=false`, `remoteBuildStarted=false`,
`productionExecutionAllowed=false`.

Próximo passo: revisão técnica humana documentada das evidências e do contrato vigente.
