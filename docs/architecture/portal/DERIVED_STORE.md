# Armazenamento derivado do Portal

**Status:** implementação inicial validada  
**Fonte de verdade:** Git  
**Persistência canônica:** proibida

## Objetivo

Manter snapshots derivados reconstruíveis da projeção institucional sem transformar o armazenamento em segunda fonte de verdade.

## Interface

Subpath:

`@apidevelopers/portal-projector/derived-store`

Função:

- `createPortalDerivedStore()`

A função retorna duas portas separadas:

- `reader`: leitura externa, com `mutationAllowed: false`;
- `publisher`: publicação interna derivada.

## Garantias

- snapshots identificados por SHA completo do commit de origem;
- checksum SHA-256 obrigatório;
- leitura do snapshot atual;
- leitura histórica por commit;
- listagem determinística de versões;
- publicação idempotente para o mesmo commit e checksum;
- bloqueio de conteúdo divergente para o mesmo commit;
- conflito otimista por `expectedCurrentCommit`;
- clone da projeção antes do armazenamento;
- troca do ponteiro atual somente após validação integral.

## Limites atuais

O store é efêmero e em memória. Não há banco, filesystem, cache distribuído, retenção, replicação, API HTTP, autenticação, release ou deploy.

A porta de publicação não é destinada a consumidores externos. O Portal deve expor somente `reader`.

## Segurança

O armazenamento não escreve no Git e não altera documentos canônicos. Todos os snapshots podem ser descartados e reconstruídos a partir do commit de origem.
