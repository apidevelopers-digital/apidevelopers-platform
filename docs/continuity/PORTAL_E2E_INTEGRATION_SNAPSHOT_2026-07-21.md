# Snapshot de continuidade — integração ponta a ponta do Portal

**Data:** 2026-07-21  
**Status:** TESTE_ADICIONADO_VALIDACAO_SINTATICA_OK  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-e2e-20260721`  
**HEAD inicial:** `1e8b15c60e94b6cb70a8326ea736eb74824f422c`

## Escopo

Foi adicionado um teste ponta a ponta que atravessa provider GitHub, leitor, pipeline documental, extrator tipado, integridade referencial e fachada institucional.

Nenhum arquivo de `activation-core`, `onboarding-core`, checkout, assinatura, provisionamento ou billing foi alterado.

## Microcommits

1. `870b5795f6c7093961a3c001d4495fc3aba52db7` — teste ponta a ponta.

## Cenários cobertos

- projeção completa com nove records institucionais;
- presença dos oito tipos canônicos;
- integridade final `in_sync`;
- checksum SHA-256;
- requisições exclusivamente `GET`;
- SHA completo presente em todas as URLs;
- determinismo entre execuções equivalentes;
- falha fechada para árvore truncada.

## Validação

Executado no ambiente local disponível:

`node --check packages/portal-projector/test/e2e-github-institutional.test.mjs`

Resultado:

- sintaxe válida;
- código de saída 0.

A suíte funcional completa não foi executada localmente porque este ambiente não possui checkout integral do repositório. Portanto, nenhum resultado funcional 3/3 é afirmado neste snapshot.

## Segurança

- sem credenciais;
- sem rede externa real;
- sem escrita no Git;
- sem merge;
- sem release;
- sem deploy;
- sem force push.

## Próximo passo exclusivo

Criar um workflow específico e não destrutivo para `packages/portal-projector`, ou executar a suíte em checkout completo, antes de tratar o teste ponta a ponta como validação funcional contínua.
