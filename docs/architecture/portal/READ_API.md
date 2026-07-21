# API institucional de leitura do Portal

**Status:** implementação interna validada  
**Transporte:** independente de HTTP  
**Mutação:** proibida

## Objetivo

Expor consultas determinísticas sobre o `reader` do armazenamento derivado sem abrir servidor, rota pública, autenticação ou acesso ao `publisher`.

## Exportação

`@apidevelopers/portal-projector/read-api`

Função:

`createPortalInstitutionalReadApi({ reader })`

O `reader` deve declarar `mutationAllowed: false` e fornecer:

- `readCurrent()`
- `readByCommit(commit)`
- `listVersions()`

## Operações

- `getSnapshot({ commit? })`
- `getSummary({ commit? })`
- `listRecords({ commit?, institutionalType?, offset?, limit? })`
- `getRecord({ commit?, institutionalType, institutionalId })`
- `listVersions({ offset?, limit? })`

## Garantias

- SHA completo para consultas históricas;
- ordenação determinística por tipo e ID;
- paginação estável com `offset`, `limit`, `total` e `hasMore`;
- limite máximo de 200 itens;
- clones defensivos nas respostas;
- ausência de qualquer método de publicação;
- `mutationAllowed: false`;
- respostas vazias quando nenhum snapshot foi publicado.

## Limites

Esta camada não é uma API HTTP. Não possui rede, autenticação, autorização, tenant, cache, rate limit, telemetria, release ou deploy. Um adaptador de transporte futuro deve consumir somente esta fachada e nunca o `publisher`.
