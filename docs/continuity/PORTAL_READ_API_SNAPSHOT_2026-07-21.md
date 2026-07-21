# Snapshot de continuidade — API institucional de leitura do Portal

**Data:** 2026-07-21  
**Status:** VALIDADA_EM_BRANCH  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch:** `work/portal-projector-read-api-20260721`  
**HEAD inicial:** `524f1bec09e695939c181dad3e1bd8238bcdf631`

## Escopo

Foi adicionada uma fachada de consulta transport-agnostic sobre o reader do armazenamento derivado.

## Microcommits

1. `eec47124261341463c90cb72a5a1bd2b45b53785` — implementação.
2. `514e0a4571ba8bacbd77e95c3c4ee2c2c9f24a45` — testes.
3. `d313dece1f5d594ef03ed1b6dfba3a6145ac9490` — exportação por subpath.
4. `a70daf0bf62cc9e2505847d1294eeae74c2959f8` — inclusão na matriz CI.

## Validação

- teste local isolado: 8 testes, 8 aprovados;
- workflow: `Portal Projector CI`;
- run ID: `29793139487`;
- SHA: `a70daf0bf62cc9e2505847d1294eeae74c2959f8`;
- conclusão: `success`;
- matriz total: 12 arquivos.

## Segurança

- somente leitura;
- sem HTTP;
- sem autenticação;
- sem dados reais;
- sem escrita no Git;
- sem release ou deploy.

## Próximo passo permitido

Após promoção e CI no SHA compartilhado, avaliar um adaptador HTTP puramente de leitura com autenticação e autorização definidas fora do pacote.
