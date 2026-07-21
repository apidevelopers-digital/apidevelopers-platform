# Publisher institucional derivado do Portal

**Status:** implementação inicial validada  
**Fonte de verdade:** Git  
**Escrita canônica:** proibida

## Objetivo

Compor a fachada institucional com o armazenamento derivado por uma operação interna explícita, sem expor mutação a consumidores.

## Interface

Subpath:

`@apidevelopers/portal-projector/institutional-publisher`

Função:

- `createPortalInstitutionalPublisher(options)`

A função recebe:

- `publisher`: porta interna do armazenamento derivado, com `mutationAllowed: true`;
- `projector`: fachada institucional injetável;
- `projectionOptions`: opções padrão da projeção.

Ela retorna uma superfície interna com:

- `projectAndPublish(input)`;
- `mutationAllowed: true`.

## Fluxo

1. recebe um leitor fixado por commit;
2. executa a projeção institucional completa;
3. publica a projeção no armazenamento derivado;
4. valida o recibo de publicação;
5. retorna apenas commit, checksum e indicador de idempotência.

## Garantias

- nenhuma publicação ocorre se a projeção falhar;
- o controle otimista é encaminhado por `expectedCurrentCommit`;
- commit e checksum do recibo devem coincidir com a projeção;
- divergências falham de forma fechada;
- a operação interna não expõe reader;
- a porta consumível permanece `derived-store.reader`;
- não há escrita canônica, commit, merge, release ou deploy.

## Limites

A operação não agenda reconstruções, não implementa fila, retry, persistência externa, API HTTP ou autenticação.
