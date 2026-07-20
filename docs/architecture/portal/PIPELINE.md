# Pipeline documental do Portal

**Status:** implementação inicial testada  
**Fonte de verdade:** Git  
**Escrita canônica:** proibida

## Objetivo

Combinar o leitor Git fixado por commit, o parser Markdown determinístico e o núcleo do projetor em uma projeção documental reconstruível.

## Entrada

- repositório;
- commit SHA completo;
- leitor explicitamente somente leitura;
- prefixes canônicos do Portal;
- versão do schema;
- versão do projetor.

Prefixes padrão:

- `docs/architecture/PORTAL_DATA_MODEL.md`
- `docs/architecture/portal`

## Pipeline

```text
fixar commit
→ listar paths permitidos
→ filtrar Markdown
→ ordenar e deduplicar
→ ler todos os blobs do mesmo commit
→ validar checksum e origem
→ aplicar parser estrutural
→ validar links internos no mesmo conjunto
→ gerar records portal_document
→ serializar canonicamente
→ calcular SHA-256
```

## Saída

A projeção contém:

- `schemaVersion`;
- `sourceRepository`;
- `sourceCommit`;
- `projectorVersion`;
- `documentCount`;
- `records`;
- `contentChecksum`.

Cada record contém `SourceRef` com commit, path e checksum.

## Invariantes

1. O leitor deve declarar `mutationAllowed: false`.
2. Todas as leituras pertencem ao mesmo SHA completo.
3. Nenhum path fora dos prefixes entra na projeção.
4. Links internos inválidos bloqueiam a projeção.
5. Conjunto vazio bloqueia a projeção.
6. A mesma entrada produz a mesma saída e checksum.
7. O pipeline não escreve no Git, não cria commits e não promove estado institucional.

## Interface

Subpath:

`@apidevelopers/portal-projector/document-pipeline`

Funções:

- `projectPortalDocuments(options)`
- `createPortalDocumentPipeline(options)`

## Limites atuais

Ainda não estão incluídos:

- provider concreto GitHub;
- extração tipada dos oito objetos institucionais;
- armazenamento derivado;
- API HTTP;
- autenticação;
- deploy ou release.
