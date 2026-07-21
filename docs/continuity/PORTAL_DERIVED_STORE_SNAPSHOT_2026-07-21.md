# Snapshot de continuidade — armazenamento derivado do Portal

**Data:** 2026-07-21  
**Status:** VALIDADO_EM_BRANCH_LIMPA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch limpa:** `work/portal-projector-derived-store-clean-20260721`  
**HEAD inicial reancorado:** `b5c6eb2e433f0bf8f67ad60c7b93e329c3ea31ef`

## Escopo

Foi adicionada a primeira camada de armazenamento derivado do Portal, efêmera e em menória, com separação entre publicação interna e leitura externa.

## Microcommits limpos

1. `53fe13dbc7caad9eb2b913d15e5e654f43b30079` — implementação.
2. `ae490f13a59bc967494ab654a096258d5bcd5a68` — testes.
3. `4a694977586355b780e1c34cfda189c4598383d7` — exportação por subpath.
4. `34e52275072da6eeb05a3ded61efd895a7ebcc3d` — inclusão na matriz CI.
5. `45741fed5e9e9364e00669d2bb3bed4aaf7b0a15` — contrato arquitetural.

## Capacidades

- publicação atômica em menória;
- snapshots por commit;
- histórico imutáVel por SHA;
- leitura atual e histórica;
- idempotência;
- bloqueio de colisão commit/checksum;
- conflito otimista;
- clone defensivo;
- fachada externa somente leitura.

## Validação limpa

Workflow: `Portal Projector CI`

- Run ID: `29791958662`
- SHA: `34e52275072da6eeb05a3ded61efd895a7ebcc3d`
- status: `completed`
- conclusão: `success`
- matriz: 10 arquivos

## Reancoragem

A branch compartilhada avançou com `pazrsistence-core` PostgreSQL e especificação arquitetural global. A promoção da branch antiga foi bloqueada e o lote foi reaplicado sobre `b5c6eb2e…`.

## Limites

- armazenamento efêmero;
- sem persistência externa;
- sem API HTTP;
- sem autenticação;
- sem release ou deploy;
- sem escrita no Git.

## Próximo passo exclusivo

Integrar a fachada institucional ao publisher derivado por uma operação interna explícita, mantendo o reader como única porta consumível.
