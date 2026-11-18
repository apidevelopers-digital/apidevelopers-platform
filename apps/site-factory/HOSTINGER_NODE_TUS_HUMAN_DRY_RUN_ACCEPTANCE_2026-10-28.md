# Aceite humano limitado — Site Factory Hostinger Node TUS

Data: 2026-10-28
PR: https://github.com/apidevelopers-digital/apidevelopers-platform/pull/737
Branch: `fix/site-factory-hostinger-node-tus-20261025`

## Decisão expressa pelo responsável nesta conversa

> Aprovo a aceitação técnica em dry-run do PR #737, sem autorizar merge, deploy, upload TUS real ou build remoto.

**Escopo:** aceite da etapa técnica de compatibilidade e testes em simulação, com ressalvas documentadas na matriz `HOSTINGER_NODE_TUS_DRY_RUN_ACCEPTANCE.md` e no parecer preliminar. O aceite não equivale a aprovação de produção, liberação de gate do monitor ou aprovação formal via interface GitHub.

## Evidência de base

- HEAD antes deste registro: `f040e93f9beb9074b39c9adac9a036c0a8e42ca5`.
- Site Factory CI #203: https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40714424122
- Contract Monitor #181: https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40693348359
- O monitor permaneceu fail-closed, com `reviewRequired=true`.

## Restrições não autorizadas

- Não realizar merge do PR #737.
- Não retirar o PR do estado draft sem nova decisão.
- Não realizar deploy, publicação ou alteração em DNS/produção.
- Não fazer upload TUS real ou POST remoto para iniciar build.
- Preservar `writesEnabled=false`, `buildStartAllowed=false`, `remoteBuildStarted=false` e `productionExecutionAllowed=false`.
- Não desligar o gate de revisão; aceite de dry-run não significa que drift futuro deva ser ignorado.

## Próximo passo

Validar o CI deste commit e preparar a separação entre encerramento da aceitação dry-run e uma futura autorização operacional específica. Sem operação em produção.
