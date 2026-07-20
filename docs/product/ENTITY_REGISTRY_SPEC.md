# ENTITY REGISTRY SPEC

**Status:** Canônico — versão inicial  
**Versão:** 0.1.0  
**Atualizado em:** 2026-07-20  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Responsável:** Produto / Arquitetura  
**Fonte de verdade:** Git

## 1. Objetivo

Este documento define o contrato canônico para registrar entidades da empresa e da plataforma.

Uma entidade representa algo que possui identidade própria, ciclo de vida, relações, regras, evidências e responsabilidade. O registro conecta capacidades, domínios, APIs, componentes, dados, Portal, testes e operação sem criar uma fonte paralela de verdade.

O registro não substitui código, schema, manifesto ou documentação de domínio. Ele fornece o índice estável que relaciona esses artefatos.

## 2. Relação com o mapa institucional

A cadeia oficial é:

```text
COMPANY_WORLD_INDEX
→ PLATFORM_CAPABILITY_REGISTRY
→ ENTITY_REGISTRY_SPEC
→ KNOWLEDGE_GRAPH_MODEL
→ PORTAL_DATA_MODEL
→ Portal
```

O Portal somente lê e governa registros versionados. Ele não inventa entidades nem mantém catálogo independente.

## 3. Identificador canônico

Cada entidade recebe um identificador imutável:

```text
ENT-<DOMINIO>-<NOME>-<NUMERO>
```

Exemplos:

- `ENT-TENANT-TENANT-001`
- `ENT-USER-USER-001`
- `ENT-PROJECT-PROJECT-001`
- `ENT-USAGE-USAGE-EVENT-001`
- `ENT-USAGE-USAGE-WINDOW-001`
- `ENT-PLAN-PLAN-001`
- `ENT-ENTITLEMENT-ENTITLEMENT-001`

Regras:

1. o identificador nunca é reutilizado;
2. renomear uma entidade não altera seu ID;
3. entidades removidas permanecem registradas como descontinuadas;
4. duplicidades devem ser resolvidas por decisão arquitetural;
5. aliases precisam apontar para um único ID canônico.

## 4. Campos obrigatórios

| Campo | Definição |
|---|---|
| ID | Identificador canônico e imutável |
| Nome | Nome funcional atual |
| Domínio | Limite de responsabilidade |
| Tipo | Aggregate, Entity, Value Object, Event, Policy, Projection ou External Reference |
| Descrição | Significado e responsabilidade |
| Capacidade | ID da capacidade principal atendida |
| Owner | Responsável funcional e técnico |
| Estado | Proposta, Definida, Implementada, Validada, Operacional ou Descontinuada |
| Maturidade | M0 a M5 |
| Identidade | Chave primária ou identidade lógica |
| Ciclo de vida | Criação, transições e encerramento |
| Relações | Ligações com outras entidades |
| Contratos | Schema, manifesto, API ou interface |
| Persistência | Repositório, tabela, coleção ou não persistente |
| Eventos | Eventos emitidos e consumidos |
| Segurança | Isolamento, autorização e dados sensíveis |
| Evidências | Código, testes, CI, documentação e operação |
| Fonte | Caminho canônico no Git |
| Bloqueadores | Pendências objetivas |

## 5. Tipos de entidade

| Tipo | Uso |
|---|---|
| Aggregate | Limite transacional e raiz de consistência |
| Entity | Objeto com identidade e ciclo de vida |
| Value Object | Valor imutável sem identidade própria |
| Event | Fato ocorrido e imutável |
| Policy | Regra de decisão ou autorização |
| Projection | Visão derivada para leitura |
| External Reference | Identidade controlada por sistema externo |

O tipo deve refletir o comportamento real. Não usar `Entity` como classificação genérica para qualquer estrutura de dados.

## 6. Estados e maturidade

Estados:

- **Proposta:** necessidade identificada;
- **Definida:** contrato e responsabilidade registrados;
- **Implementada:** código rastreável existente;
- **Validada:** testes e CI relevantes verdes;
- **Operacional:** persistência, segurança, observabilidade e suporte ativos;
- **Descontinuada:** não recebe novas dependências e possui plano de transição.

Maturidade:

| Nível | Critério |
|---|---|
| M0 | conceito registrado |
| M1 | contrato e owner definidos |
| M2 | implementação inicial |
| M3 | testes e CI segmentada |
| M4 | persistência, segurança, auditoria e observabilidade operacionais |
| M5 | automação, suporte, SLOs e uso comercial governado |

A maturidade da entidade não pode exceder a evidência disponível.

## 7. Relação com capacidades

Toda entidade deve apontar para ao menos uma capacidade registrada.

Uma capacidade pode depender de várias entidades. Uma entidade pode apoiar capacidades secundárias, mas precisa ter uma capacidade principal e um domínio proprietário.

Exemplo:

```text
CAP-USAGE-001
├── ENT-USAGE-USAGE-EVENT-001
├── ENT-USAGE-USAGE-WINDOW-001
└── ENT-USAGE-USAGE-AGGREGATE-001
```

Nenhuma entidade deve ser criada apenas porque uma tabela ou classe existe. Primeiro deve existir responsabilidade de negócio ou de plataforma.

## 8. Registro inicial

### ENT-TENANT-TENANT-001 — Tenant

- **Domínio:** Tenant Core
- **Tipo:** Aggregate
- **Capacidade principal:** `CAP-TENANT-001`
- **Descrição:** unidade de isolamento, propriedade e governança da plataforma.
- **Estado:** Validada
- **Maturidade:** M3
- **Identidade:** `tenant_id`
- **Relações:** possui usuários, projetos, planos, entitlements e eventos de uso.
- **Bloqueadores:** persistência durável, migrações, auditoria e isolamento operacional comprovado.

### ENT-USER-USER-001 — User

- **Domínio:** User Core
- **Tipo:** Entity
- **Capacidade principal:** `CAP-USER-001`
- **Descrição:** identidade de usuário vinculada a um contexto de tenant.
- **Estado:** Validada
- **Maturidade:** M3
- **Identidade:** `user_id`
- **Relações:** pertence a tenant e participa de projetos e políticas de acesso.
- **Bloqueadores:** autenticação, autorização, recuperação, persistência e auditoria.

### ENT-PROJECT-PROJECT-001 — Project

- **Domínio:** Project Core
- **Tipo:** Aggregate
- **Capacidade principal:** `CAP-PROJECT-001`
- **Descrição:** unidade organizacional e operacional onde recursos e uso são agrupados.
- **Estado:** Validada
- **Maturidade:** M3
- **Identidade:** `project_id`
- **Relações:** pertence a tenant, possui membros, credenciais, uso e configurações.
- **Bloqueadores:** persistência, migrações, autorização, auditoria e integração com gateway.

### ENT-USAGE-USAGE-EVENT-001 — Usage Event

- **Domínio:** Usage Core
- **Tipo:** Event
- **Capacidade principal:** `CAP-USAGE-001`
- **Descrição:** fato imutável de consumo associado a tenant, projeto, identidade e métrica.
- **Estado:** Validada
- **Maturidade:** M3
- **Identidade:** `usage_event_id` ou chave idempotente equivalente.
- **Relações:** referencia tenant, projeto, métrica e janela de agregação.
- **Bloqueadores:** ingestão durável, retenção, reconciliação, observabilidade e integração com billing.

### ENT-USAGE-USAGE-WINDOW-001 — Usage Window

- **Domínio:** Usage Core
- **Tipo:** Projection
- **Capacidade principal:** `CAP-USAGE-001`
- **Descrição:** intervalo configurável usado para agregar eventos de uso.
- **Estado:** Validada
- **Maturidade:** M3
- **Identidade:** composição entre escopo, métrica, início e fim da janela.
- **Relações:** agrega eventos e alimenta quotas, relatórios, Portal e billing.
- **Bloqueadores:** persistência, reconciliação, regras de atraso e consistência operacional.

## 9. Regras de alteração

Antes de criar ou alterar uma entidade:

1. conferir o `COMPANY_WORLD_INDEX.md`;
2. verificar o `PLATFORM_CAPABILITY_REGISTRY.md`;
3. procurar entidade ou alias já existente;
4. confirmar domínio e owner;
5. registrar contrato e relações;
6. implementar em lote pequeno;
7. validar testes e CI;
8. anexar evidências;
9. atualizar estado e maturidade;
10. registrar decisão arquitetural quando houver incompatibilidade.

Mudanças incompatíveis exigem versão de contrato, plano de migração e decisão arquitetural registrada.

## 10. Evidência mínima

Uma entidade só pode avançar para:

- **Implementada:** quando houver implementação rastreável;
- **Validada:** quando houver testes e CI verdes;
- **Operacional:** quando persistência, segurança, auditoria, observabilidade e suporte estiverem ativos;
- **M5:** quando houver automação, SLOs e governança comercial.

Código isolado não comprova prontidão operacional.

## 11. Consumo futuro pelo Portal

O Portal deverá exibir, sem duplicar:

- identidade e nome;
- domínio e capacidade;
- estado e maturidade;
- owner;
- relações;
- contratos;
- evidências;
- bloqueadores;
- histórico de alterações;
- origem no Git.

Toda visualização precisa apontar para a fonte canônica e para a evidência que sustenta o estado exibido.

## 12. Próximo passo

1. validar este registro contra manifests e código existente;
2. completar entidades de `plan-core` e `entitlement-core`;
3. criar `KNOWLEDGE_GRAPH_MODEL.md`;
4. definir o consumo pelo Portal em `PORTAL_DATA_MODEL.md`;
5. atualizar `CURRENT_STATE.md` ao concluir o marco.

## 13. Regra permanente

> Entidade sem identidade, owner, capacidade, contrato, evidência e fonte canônica não pertence ao mapa oficial da empresa.
