# Extração tipada institucional do Portal

**Status:** implementação inicial testada  
**Fonte de verdade:** Git  
**Escrita canônica:** proibida

## Objetivo

Converter os blocos YAML já extraídos pela projeção documental nos oito objetos institucionais definidos pelo modelo do Portal:

- `SourceRef`
- `Node`
- `Relation`
- `Evidence`
- `StateSnapshot`
- `Iteration`
- `Approval`
- `AuditEvent`

## Entrada

A entrada é uma projeção documental reconstruível, fixada por SHA completo, contendo records `portal_document` e seus blocos YAML estruturados.

## Regras

1. O tipo é reconhecido somente por uma assinatura fechada de campos obrigatórios.
2. Blocos não relacionados são ignorados; nenhum tipo é inventado.
3. Correspondência ambígua bloqueia a extração.
4. IDs duplicados dentro do mesmo tipo bloqueiam a extração.
5. Todo `source_ref` deve apontar para o mesmo commit da projeção documental.
6. A posição original do bloco YAML é preservada como evidência auditável.
7. A saída é ordenada canonicamente por tipo e identificador.
8. O checksum SHA-256 cobre a projeção lógica completa.
9. O extrator não escreve no Git nem promove estado institucional.

## Interface

Subpath:

`@apidevelopers/portal-projector/typed-extractor`

Funções:

- `extractInstitutionalRecords(documentProjection, options)`
- `createPortalTypedExtractor(options)`
- `PORTAL_INSTITUTIONAL_TYPES`

A opção `requireAllTypes: true` exige a presença dos oito tipos e falha fechada quando algum estiver ausente.

## Saída

A projeção contém:

- `schemaVersion`
- `sourceRepository`
- `sourceCommit`
- `extractorVersion`
- `recordCount`
- `counts`
- `records`
- `contentChecksum`

Cada record preserva:

- `institutionalType`
- `institutionalId`
- `value`
- `sourceRef`
- `extractedFrom`

## Limites atuais

A implementação ainda não valida integralmente a integridade referencial entre os objetos, como relações para nós inexistentes ou evidências para sujeitos ausentes. Essa validação pertence ao próximo estágio de reconciliação tipada.
