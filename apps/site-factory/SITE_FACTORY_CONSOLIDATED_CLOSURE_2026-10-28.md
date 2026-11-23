# Fechamento consolidado — Site Factory (28/10/2026)

## Escopo e autoridade
- Repositorio: apidevelopers-digital/apidevelopers-platform
- Frente: apps/site-factory
- PR de migracao Hostinger Node TUS: #737, branch fix/site-factory-hostinger-node-tus-20261025.
- Este registro consolida evidencia e nao autoriza merge, deploy ou modificacao de producao.

## Concluido e comprovado nesta frente
- Planejamento e serializacao offline do fluxo Hostinger Node TUS, conforme contrato OpenAPI 2.5.1 testado.
- Checagens de archive_path, rejeicoes e salvaguardas em dry-run.
- Matriz de aceitacao: HOSTINGER_NODE_TUS_DRY_RUN_ACCEPTANCE.md.
- Parecer preliminar: HOSTINGER_NODE_TUS_PRELIMINARY_TECHNICAL_REVIEW.md.
- Aceite humano explicito e restrito ao dry-run: HOSTINGER_NODE_TUS_HUMAN_DRY_RUN_ACCEPTANCE_2026-10-28.md.
- Site Factory CI #204 aprovado no commit 9acda48 (evidencia: https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40719300791).

## Escopo maior do Site Factory
- Existem componentes e documentos de templates, preview, website creation, publication, build e integracao Hostinger sob apps/site-factory.
- A presenca desses componentes nao comprova homologacao ponta a ponta nem producao operacional.
- A etapa TUS aceita em dry-run e um subconjunto da frente Site Factory.

## Estado operacional preservado
- PR #737 permanece draft ate autorizacao distinta e verificavel.
- Nao autorizado: merge, deploy, upload TUS real, POST remoto de build, alteracoes de producao ou desligamento do monitor fail-closed.
- Manter writesEnabled=false, buildStartAllowed=false, remoteBuildStarted=false, productionExecutionAllowed=false.
- Contract Monitor #187 com bloqueio fail-closed: falha esperada do gate nao constitui teste funcional aprovado nem autorizacao.
- Homologacao real, publicacao e integracao final permanecem fora do aceite de dry-run.

## Ponto de reconciliacao institucional
- Usuario mencionou frente ALT em conjunto com Site Factory.
- ALT nao foi identificado de forma inequívoca na busca efetuada; nao declarar fechado, integrado ou publicado sem confirmar o repositorio/produto correto.
- Evitar confundir ALT com TUS ou com uma parte do Site Factory.

## Encerramento
- Encerrar documentalmente a entrega tecnica Hostinger Node TUS em dry-run, aceita pelo responsavel e validada pelo CI.
- Nao encerrar o produto Site Factory inteiro como homologado em producao.
- Proxima decisao operacional, em momento separado* avaliar escopo do Site Factory completo e vinculo da frente ALT antes de eventual integracao ou liberacao.
