# Mapa de fechamento - OAuth e Site Factory (2026-10-28)

## Correcao de escopo
As duas frentes sao OAuth e Site Factory. ALT foi interpretacao incorreta, nao um terceiro produto. A referencia a ALT no fechamento anterior deve ser considerada sem efeito.

## Site Factory: industria de producao de sites
Repositorio: apidevelopers-digital/apidevelopers-platform; apps/site-factory.
PR: https://github.com/apidevelopers-digital/apidevelopers-platform/pull/737
- Hostinger Node TUS: planejamento, serializacao e testes offline aceitos por Igor somente em dry-run, com evidencia de CI #204: https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40719300791
- Limite: nao comprova producao ou publicacao ponta a ponta; PR permanece draft ate autorizacao distinta.
- Pagina publica comercial: proposta de interface separada do painel interno; nenhuma URL publicada foi comprovada nesta consolidacao.
- Painel interno: inventariar fluxo de cliente, projeto, template, preview, pacote e publicacao antes de declarar produto completo.
- Bloqueios: sem merge, deploy, upload TUS real, build remoto ou desligamento do monitor fail-closed.
- Preservar writesEnabled=false, buildStartAllowed=false, remoteBuildStarted=false, productionExecutionAllowed=false.

## OAuth: frente distinta
Repositorio: apidevelopers-digital/apidevelopers-mcp-brain.
PR: https://github.com/apidevelopers-digital/apidevelopers-mcp-brain/pull/171
- Rota /oauth/authorize isolada para revisao e seguranca. A presenca do codigo nao comprova OAuth ponta a ponta homologado.
- Faltam confirmacoes integradas de PKCE, /oauth/authorize, /oauth/token, erros, seguranca e comportamento real em ambiente controlado.
- Uma tentativa de ler workflow OAuth por nome terminou em 404; portanto nao afirmar CI especifico confirmado por essa consulta.
- Sem merge ou habilitacao publica autorizados.

## Encerramento por escopo
1. Site Factory Hostinger TUS dry-run: aceito humanamente e CI principal aprovado.
2. Site Factory produto completo e pagina publica: pendente de validacao funcional e decisao de publicacao.
3. OAuth integral: pendente de verificacao ponta a ponta e aceite proprio.

## Proximo passo
Validar em dry-run o fluxo completo da fabrica - entrada de projeto, template, preview, pacote e plano de publicacao. Preparar proposta de pagina publica comercial separada do painel administrativo. Sem executar publicacao.
