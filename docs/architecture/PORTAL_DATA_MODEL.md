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
