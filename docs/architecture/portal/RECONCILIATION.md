# Reconciliação do Portal

**Status:** canônico — contrato inicial  
**Fonte de verdade:** Git  
**Relacionados:** [`../PORTAL_DATA_MODEL.md`](../PORTAL_DATA_MODEL.md), [`PROJECTIONS.md`](PROJECTIONS.md)

## Objetivo

Detectar e tratar diferenças entre o Git canônico, projeções, API e interfaces. A reconciliação não cria uma nova verdade: o Git prevalece.

## Estados

- `in_sync`: conteúdo lógico equivalente.
- `stale`: projeção válida em commit anterior.
- `divergent`: mesma origem declarada, conteúdo diferente.
- `missing`: registro esperado ausente.
- `orphaned`: derivado sem origem válida.
- `invalid`: violação de schema, integridade ou referência.
- `unavailable`: camada necessária indisponível.

`unavailable` nunca equivale a `in_sync`.

## Relatório mínimo

```yaml
schema_version: portal.reconciliation/v1
reconciliation_id: REC-0001
expected_commit: <sha>
observed_head: <sha>
observed_at: <timestamp>
status: divergent
findings: []
evidence_ids: []
audit_event_id: AUD-0001
```

Cada finding registra código, objeto, estado, esperado, observado, camada, severidade e ação recomendada.

## Fluxo

1. Fixar commit esperado e HEAD observado.
2. Validar a existência do commit.
3. Carregar o conjunto canônico.
4. Validar projeções e envelopes.
5. Comparar schemas, IDs, relações, checksums e contagens.
6. Consultar a API no mesmo commit.
7. Classificar diferenças.
8. Registrar `Evidence` e `AuditEvent`.
9. Propor correção.
10. Reexecutar e preservar os relatórios.

## Correção

Podem ser automáticos, quando reversíveis: invalidar cache, reconstruir projeção, reindexar e trocar ponteiro para projeção validada.

Exigem proposta, revisão e autorização: alterar documento canônico, schema, ID, relação, estado, prontidão ou política.

## Conflitos e bloqueios

Quando Portal e Git divergem, a projeção é isolada e o Git prevalece. Não há merge semântico automático.

Bloqueiam promoção de prontidão: divergência canônica, projeção sem `SourceRef`, checksum incompatível, commit inexistente, aprovação inválida, estado validado sem `Evidence` ou isolamento de tenant não comprovado.
