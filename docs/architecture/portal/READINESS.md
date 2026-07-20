# Prontidão do Portal

**Status:** canônico — critérios iniciais  
**Fonte de verdade:** Git  
**Relacionados:** [`PROJECTIONS.md`](PROJECTIONS.md), [`RECONCILIATION.md`](RECONCILIATION.md), [`API_MODEL.md`](API_MODEL.md)

## Objetivo

Prontidão é uma conclusão baseada em evidências sobre a capacidade do Portal de cumprir um escopo definido. Não é percentual isolado, autorização de produção ou substituto de aprovação explícita.

## Estados

- `draft`
- `structurally_ready`
- `operationally_ready`
- `release_candidate`
- `production_ready`

`production_ready` descreve evidência; deploy e publicação continuam exigindo autorização específica.

## Dimensões

1. **Proveniência:** todo objeto possui `SourceRef`, commit existente e checksum verificável.
2. **Integridade:** IDs, relações, estados, evidências e schemas são válidos.
3. **Projeções:** reconstrução é determinística, atômica e recuperável.
4. **Reconciliação:** divergências são classificadas e não há bloqueio aberto.
5. **API:** respostas carregam commit, projeção e códigos de erro estáveis.
6. **Governança:** aprovações são escopadas e ações sensíveis ficam bloqueadas sem gate.
7. **Segurança:** segredos não aparecem, tenants são isolados e acesso é validado.
8. **Operação:** health checks, observabilidade, backup, rollback e runbook existem.

## Gates

### `structurally_ready`

Exige documentação raiz e módulos presentes, schemas definidos, validação estrutural automatizada e nenhum erro crítico de integridade.

### `operationally_ready`

Exige projetor, reconstrução, reconciliador e API de leitura funcionais, além de testes de falha e evidências registradas.

### `release_candidate`

Exige escopo congelado, riscos documentados, rollback ensaiado, revisão de segurança, documentação operacional e CI relevante verde por commit.

### `production_ready`

Exige ambiente alvo, gestão de segredos, monitoramento, capacidade testada, aprovação explícita e plano de mudança e rollback aprovado.

## Avaliação

```yaml
schema_version: portal.readiness/v1
assessment_id: RDY-0001
scope: portal-foundation
source_commit: <sha>
assessed_at: <timestamp>
state: structurally_ready
dimensions:
  provenance: passed
  model_integrity: passed
  projections: not_evaluated
  reconciliation: not_evaluated
  api: not_evaluated
  governance: passed
  security: not_evaluated
  operations: not_evaluated
blockers: []
evidence_ids: []
assessor: <actor-or-system>
```

Resultados possíveis: `passed`, `failed`, `blocked`, `not_evaluated`, `not_applicable`. `not_evaluated` nunca equivale a `passed`.

## Bloqueadores absolutos

- origem não rastreável;
- divergência canônica aberta;
- estado validado sem evidência;
- segredo exposto;
- isolamento de tenant não comprovado;
- rollback inexistente;
- aprovação ausente quando exigida;
- CI relevante não identificado;
- falha crítica sem responsável.

Percentuais podem apoiar planejamento, mas não substituem gates nem autorização.

## Estado documental atual

A conclusão destes documentos permite avaliar a fundação para `structurally_ready`. Não comprova implementação, API funcional, segurança operacional, ambiente, release, deploy ou produção.
