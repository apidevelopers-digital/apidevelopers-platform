# Projeções do Portal

**Status:** canônico — contrato inicial  
**Atualizado em:** 2026-07-20  
**Fonte de verdade:** Git  
**Documento raiz:** [`../PORTAL_DATA_MODEL.md`](../PORTAL_DATA_MODEL.md)

## 1. Objetivo

Projeções são modelos de leitura derivados do conteúdo canônico versionado no Git. Servem para navegação, filtros, dashboards e validações sem transformar o Portal em uma segunda fonte de verdade.

Uma projeção deve poder ser removida e reconstruída a partir da origem.

## 2. Invariantes

Toda projeção deve ser:

- determinística para a mesma origem e versão do gerador;
- rastreável até repositório, branch e commit;
- validada antes de publicação;
- substituível de forma atômica;
- reconstruível sem edição manual;
- marcada como obsoleta quando o HEAD canônico avançar;
- incapaz de elevar estado além das evidências disponíveis.

## 3. Envelope

```yaml
schema_version: portal.projection/v1
projection_type: graph-index
projection_id: PRJ-GRAPH-INDEX-0001
source:
  repository: sitedauni/apidevelopers-platform
  branch: foundation/global-platform-bootstrap-20260715
  commit: <sha>
generator:
  name: portal-projector
  version: <semver-or-commit>
generated_at: <timestamp>
record_count: 0
content_checksum: <sha256>
status: ready
records: []
```

`generated_at` descreve a execução e não altera o checksum do conteúdo lógico.

## 4. Projeções iniciais

### `graph-index`

Índice de `Node` e `Relation`, otimizado para navegação por ID, tipo, status, owner e relacionamento.

### `evidence-index`

Agrupa `Evidence` por sujeito, tipo, status, commit, workflow e validade.

### `state-index`

Expõe `StateSnapshot` por escopo, commit observado e momento de captura.

### `iteration-index`

Organiza `Iteration` por estado, escopo, bloqueios, ações autorizadas e origem.

### `governance-index`

Relaciona `Approval` e `AuditEvent` às ações, evidências e objetos afetados.

### `readiness-view`

Consolida sinais verificáveis de prontidão sem substituir os critérios de [`READINESS.md`](READINESS.md).

## 5. Identidade e ordenação

1. IDs canônicos são preservados.
2. Registros auxiliares usam namespace e algoritmo documentados.
3. Listas possuem ordenação estável.
4. Datas usam UTC em ISO 8601.
5. Campo ausente e campo nulo não são equivalentes quando o schema distinguir os casos.
6. Enumerações preservam a grafia canônica.

## 6. Checksum

O `content_checksum` é calculado sobre uma representação canônica:

1. excluir metadados de execução não determinísticos;
2. ordenar chaves;
3. ordenar coleções quando a semântica não exigir ordem;
4. serializar em UTF-8;
5. calcular SHA-256.

## 7. Reconstrução

A reconstrução completa deve:

1. fixar o commit de origem;
2. ler apenas o conteúdo desse commit;
3. validar `SourceRef`, IDs e relações;
4. gerar todas as projeções;
5. validar checksums e contagens;
6. publicar o conjunto atomicamente;
7. registrar `AuditEvent`;
8. iniciar reconciliação pós-publicação.

Não se misturam arquivos de commits diferentes no mesmo conjunto.

## 8. Atualização incremental

É permitida quando o diff de origem for conhecido, o schema for compatível e o resultado final produzir o mesmo checksum lógico de uma reconstrução completa.

Sem essa equivalência demonstrável, deve ser usada reconstrução completa.

## 9. Estados

- `building`
- `ready`
- `stale`
- `invalid`
- `failed`
- `superseded`

Somente `ready` pode atender como visão corrente. `stale` pode ser exibida com aviso e referência explícita ao commit atrasado, conforme política.

## 10. Falhas e restrições

Falha de projeção:

- não altera o Git;
- preserva a última projeção válida;
- registra diagnóstico e diferença de HEAD;
- impede promoção silenciosa de conteúdo parcial;
- encaminha divergências para reconciliação.

Projeções não podem aprovar ações, executar deploy, alterar documentos canônicos, ocultar registros inválidos ou combinar tenants sem autorização e isolamento explícitos.
