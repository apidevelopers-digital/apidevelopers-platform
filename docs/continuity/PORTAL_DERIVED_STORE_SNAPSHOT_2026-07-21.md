# Snapshot de continuidade — armazenamento derivado do Portal

**Data:** 2026-07-21  
**Status:** VALIDADO_EM_BRANCH  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-derived-store-20260721`  
**HEAD inicial:** `bc24e94ca37a3625ddc98d01def056bc2e6873de`

## Escopo

Foi adicionada a primeira camada de armazenamento derivado do Portal, efêmera e em memória, com separação entre publicação interna e leitura externa.

## Microcommits

1. `94a8e59d9d138e9d315a7348a580b78d1c399935` — implementação.
2. `6e9bf329f93b81a4bd48b5103e88f35663906dd0` — testes.
3. `43c229198cde2e6eca4982deaea85f34fdae08b5` — exportação por subpath.
4. `b6a87fea35aab494fd382d44e37a2e6be2e18d15` — inclusão na matriz CI.

## Capacidades

- publicação atômica em memória;
- snapshots por commit;
- histórico imutável por SHA;
- leitura atual e histórica;
- idempotência;
- bloqueio de colisão commit/checksum;
- conflito otimista;
- clone defensivo;
- fachada externa somente leitura.

## Validação

Workflow: `Portal Projector CI`

- Run ID: `29791826919`
- SHA: `b6a87fea35aab494fd382d44e37a2e6be2e18d15`
- status: `completed`
- conclusão: `success`
- matriz: 10 arquivos

## Limites

- armazenamento efêmero;
- sem persistência externa;
- sem API HTTP;
- sem autenticação;
- sem release ou deploy;
- sem escrita no Git.

## Próximo passo exclusivo

Integrar a fachada institucional ao publisher derivado por uma operação interna explícita, mantendo o reader como única porta consumível.
