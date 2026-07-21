# Fachada institucional do Portal

**Status:** implementação inicial testada  
**Fonte de verdade:** Git  
**Escrita canônica:** proibida

## Objetivo

Compor, em uma única operação somente leitura, os três estágios já existentes:

1. projeção documental fixada por commit;
2. extração tipada dos objetos institucionais;
3. reconciliação de integridade referencial.

## Interface

Subpath:

`@apidevelopers/portal-projector/institutional-facade`

Funções:

- `projectPortalInstitutionalState(options)`
- `createPortalInstitutionalFacade(options)`

## Invariantes

- o leitor deve declarar `mutationAllowed: false`;
- o commit deve permanecer idêntico entre leitor, projeção documental, projeção tipada e integridade;
- qualquer divergência de commit falha de forma fechada;
- a integridade final deve estar em `in_sync`;
- a saída é determinística e recebe checksum SHA-256;
- a fachada não escreve no Git, não cria commits e não promove branches.

## Saída

A projeção institucional contém:

- `schemaVersion`;
- `facadeVersion`;
- `sourceRepository`;
- `sourceCommit`;
- checksums documental e tipado;
- contagem de documentos;
- contagem de records;
- contagens por tipo;
- records institucionais;
- resumo de integridade;
- `contentChecksum`.

## Limites atuais

Continuam fora desta fachada:

- provider concreto GitHub;
- persistência derivada;
- API HTTP;
- autenticação;
- release e deploy.
