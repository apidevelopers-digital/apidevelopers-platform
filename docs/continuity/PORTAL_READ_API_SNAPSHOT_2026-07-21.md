# Snapshot de continuidade — API institucional de leitura do Portal

**Data:** 2026-07-21  
**Status:** VALIDADA_EM_BRANCH_LIMPA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch:** `work/portal-projector-read-api-clean-20260721`  
**HEAD inicial reancorado:** `bdeff90243c14332135abdad554ba162a1461cb6`

## Escopo

Foi adicionada uma fachada de consulta transport-agnostic sobre o reader do armazenamento derivado.

## Microcommits limpos

1. `4b73ebd3f3b7217b9dd9ef92b4443e25fc9a4557` — implementação.
2. `34b05f1cef4696606a288359dd11a687c10ed4c3` — testes.
3. `a4b4c2a06606003786cde3ca3900539e216072de` — exportação por subpath.
4. `03b5d615a16ade90e75715c3d9b2dbeb05448613` — inclusão na matriz CI.
5. `d2cb8bd00e6fbd3160bd6ef41002d77e0c408948` — contrato arquitetural.

## Validação

- teste local isolado: 8 testes, 8 aprovados;
- workflow: `Portal Projector CI`;
- run limpo: `29793273133`;
- SHA validado: `03b5d615a16ade90e75715c3d9b2dbeb05448613`;
- conclusão: `success`;
- matriz total: 12 arquivos.

## Reancoragem

A promoção da branch original foi bloqueada porque a branch compartilhada avançou com `persistence-core` e documentação arquitetural global. O lote foi reaplicado sobre `bdeff90243c14332135abdad554ba162a1461cb6`.

## Segurança

- somente leitura;
- sem HTTP;
- sem autenticação;
- sem dados reais;
- sem escrita no Git pela API;
- sem release ou deploy.

## Próximo passo permitido

Após promoção e CI no SHA compartilhado, avaliar um adaptador HTTP puramente de leitura com autenticação e autorização definidas fora do pacote.
