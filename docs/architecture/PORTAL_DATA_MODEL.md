# PORTAL DATA MODEL

**Status:** Canônico — versão inicial  
**Versão:** 0.1.0  
**Atualizado em:** 2026-07-20  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Responsável:** Produto / Arquitetura  
**Fonte de verdade:** Git

## 1. Objetivo

Este documento define como o Portal deve ler, organizar, representar e operar sobre o grafo institucional sem criar uma segunda fonte de verdade.

O Portal existe para facilitar navegação, governança, continuidade e operação assistida.

## 2. Princípio central

> Git é a memória institucional e a fonte canônica. O Portal lê, projeta, organiza e opera, mas não cria uma verdade paralela.

## 3. Regras iniciais

1. Todo dado exibido deve apontar para uma origem versionada.
2. Nenhum estado pode ser declarado sem evidência.
3. O Portal não inventa IDs, capacidades, entidades ou relações.
4. Dados derivados devem ser reproduzíveis a partir do Git.
5. Alterações sensíveis exigem aprovação e trilha de auditoria.
6. Divergências devem ser exibidas, nunca ocultadas.

## 4. Cadeia de derivação

```text
Git e documentos canônicos
→ extrator e validador
→ grafo institucional derivado
→ índice de consulta
→ API do Portal
→ visões, dashboards e ações assistidas
```

## 5. Evolução por microcommits

Este documento deve ser expandido em blocos temáticos curtos, cada um com commit próprio.

Sequência prevista:

1. objetos do modelo;
2. referência de origem;
3. evidência, estado e bloqueadores;
4. ações, aprovações e auditoria;
5. projeções de interface;
6. reconciliação com o Git;
7. API mínima;
8. critérios de prontidão.

## 6. Regra permanente

> O Portal pode organizar, projetar, acelerar e operar. A verdade institucional continua versionada no Git.

## 7. Objetos fundamentais

O núcleo do Portal é composto por quatro objetos. Eles devem permanecer pequenos, rastreáveis e independentes da tecnologia de armazenamento.

### 7.1 SourceRef

`SourceRef` identifica a origem canônica de qualquer dado exibido pelo Portal.

```yaml
repository: sitedauni/apidevelopers-platform
branch: foundation/global-platform-bootstrap-20260715
commit: <sha>
path: docs/architecture/KNOWLEDGE_GRAPH_MODEL.md
anchor: tipos-de-nos
checksum: <sha256>
observed_at: <timestamp>
```

Regras:

1. `commit`, `path` e `checksum` são obrigatórios para conteúdo canônico.
2. `branch` informa o contexto de leitura, mas não substitui o commit.
3. `anchor` é opcional e aponta para uma seção específica.
4. A ausência de `SourceRef` torna o dado não canônico.
5. Alterações na origem devem gerar nova referência e nova evidência.

### 7.2 Node

`Node` representa uma unidade institucional do grafo.

```yaml
id: CAP-PERSISTENCE-DURABLE-STORE-001
type: capability
name: Durable Store
status: validated
maturity: M3
owner: platform-engineering
source_ref: <SourceRef>
evidence_ids:
  - EVD-PERSISTENCE-CI-001
blocker_ids: []
updated_at: <timestamp>
```

Campos mínimos:

- `id`
- `type`
- `name`
- `status`
- `owner`
- `source_ref`
- `updated_at`

Os tipos e IDs devem seguir `KNOWLEDGE_GRAPH_MODEL.md`.

### 7.3 Relation

`Relation` conecta dois nós por uma relação tipada.

```yaml
id: REL-0001
type: IMPLEMENTS
from: CMP-PERSISTENCE-PERSISTENCE-CORE-001
to: CAP-PERSISTENCE-DURABLE-STORE-001
source_ref: <SourceRef>
confidence: canonical
```

Regras:

1. `from` e `to` devem apontar para nós existentes.
2. `type` deve pertencer à taxonomia canônica.
3. Relações derivadas devem informar sua origem.
4. Relações inválidas devem ser rejeitadas, nunca ocultadas.
5. A direção da relação é semanticamente relevante.

### 7.4 Evidence

`Evidence` registra a prova observável que sustenta um estado, relação ou capacidade.

```yaml
id: EVD-PERSISTENCE-CI-001
type: ci_run
status: passed
subject_id: CMP-PERSISTENCE-PERSISTENCE-CORE-001
workflow: persistence-validation
commit: <sha>
provider_reference: <external-reference>
observed_at: <timestamp>
source_ref: <SourceRef>
```

Estados mínimos:

- `declared`
- `observed`
- `passed`
- `failed`
- `expired`
- `divergent`
- `missing`

Uma declaração sem evidência deve aparecer como não validada.

## 8. Integridade do núcleo

O Portal deve rejeitar ou sinalizar:

- objeto sem `SourceRef`;
- nó sem owner;
- relação com origem ou destino inexistente;
- evidência sem sujeito;
- estado validado sem evidência válida;
- checksum divergente;
- referência para commit inexistente;
- IDs duplicados.

> O modelo visual pode evoluir. A rastreabilidade entre objeto, origem e evidência é permanente.

## 9. Estado, iteração e governança

### 9.1 StateSnapshot

`StateSnapshot` registra uma fotografia factual e reproduzível do estado institucional em um commit específico.

```yaml
id: STATE-GLOBAL-PLATFORM-001
scope: global-platform
status: active
head: <sha>
captured_at: <timestamp>
source_ref: <SourceRef>
validated_by:
  - EVD-STATE-INTEGRITY-001
```

Regras:

1. Todo snapshot deve apontar para um commit imutável.
2. Um snapshot não substitui o histórico do Git.
3. Mudança de `head` exige novo snapshot.
4. Estado sem evidência válida deve aparecer como não validado.
5. Snapshots divergentes devem ser preservados para auditoria.

### 9.2 Iteration

`Iteration` representa o próximo lote de trabalho autorizado, com escopo e limites explícitos.

```yaml
id: ITER-PORTAL-DATA-MODEL-001
title: Consolidar o modelo de dados do Portal
status: in_progress
scope:
  - docs/architecture/PORTAL_DATA_MODEL.md
authorized_actions:
  - update_document
forbidden_actions:
  - merge
  - release
  - deploy
source_ref: <SourceRef>
```

Regras:

1. Toda iteração deve declarar escopo, estado e ações autorizadas.
2. Ações fora do escopo devem ser bloqueadas.
3. Merge, release, deploy e publicação real exigem autorização explícita.
4. A conclusão deve apontar para commit e evidência.
5. A próxima iteração só deve ser aberta após registrar o estado resultante.

### 9.3 Approval

`Approval` registra autorização explícita para uma ação sensível.

```yaml
id: APR-001
action_id: ACT-001
status: approved
approved_by: <actor-id>
approved_at: <timestamp>
scope:
  - production-deploy
expires_at: <timestamp-or-null>
source_ref: <SourceRef>
```

Regras:

1. Aprovação deve identificar ação, aprovador, escopo e momento.
2. Aprovação não pode ser reutilizada fora do escopo.
3. Aprovação expirada ou revogada bloqueia a execução.
4. Ausência de aprovação deve resultar em dry-run ou bloqueio.
5. Aprovação nunca substitui validações técnicas.

### 9.4 AuditEvent

`AuditEvent` registra uma ação executada ou bloqueada e seu resultado observável.

```yaml
id: AUD-001
action_id: ACT-001
actor_id: <actor-id>
result: success
executed_at: <timestamp>
source_ref: <SourceRef>
approval_id: APR-001
evidence_id: EVD-DEPLOY-001
```

Resultados mínimos:

- `success`
- `failed`
- `blocked`
- `cancelled`
- `dry_run`

Regras:

1. Toda ação sensível deve produzir evento de auditoria.
2. Eventos de auditoria não devem ser alterados retroativamente.
3. Falhas e bloqueios devem ser registrados com a mesma disciplina dos sucessos.
4. O evento deve ligar ação, aprovação e evidência quando aplicável.
5. O Portal deve permitir navegar do evento até sua origem no Git.

## 10. Ciclo operacional mínimo

```text
Iteration
→ Action
→ Approval, quando exigida
→ Execution ou Block
→ AuditEvent
→ Evidence
→ StateSnapshot
→ próxima Iteration
```

Esse ciclo conecta planejamento, autorização, execução, evidência e continuidade sem retirar do Git sua autoridade institucional.


## 11. Módulos da arquitetura do Portal

A especificação detalhada foi dividida em módulos menores para preservar clareza, revisão temática e evolução por microcommits:

- [Visão geral e invariantes](portal/README.md)
- [Projeções derivadas do Git](portal/PROJECTIONS.md)
- [Reconciliação entre fonte, projeções e superfícies](portal/RECONCILIATION.md)
- [Modelo inicial da API de leitura](portal/API_MODEL.md)
- [Critérios de prontidão](portal/READINESS.md)
- [Contrato executável do projetor](portal/PROJECTOR_CONTRACT.md)

Estes módulos complementam este documento. Em caso de divergência, o modelo canônico versionado no Git e suas referências explícitas prevalecem.
