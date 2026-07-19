# DIGITAL COMPANY BLUEPRINT

**Status:** ativo  
**Plataforma:** API Developers.digital  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch de trabalho:** `foundation/global-platform-bootstrap-20260715`  
**Objetivo:** descrever a empresa como um sistema digital versionado, auditável e operável por pessoas, portal e agentes de IA.

## 1. Princípio central

> A empresa deve ser compreensível e continuável a partir de suas fontes oficiais, sem depender da memória de uma conversa, de uma pessoa específica ou de conhecimento informal.

A conversa é ambiente de elaboração.  
O Git é memória institucional.  
O Portal é governança visual e operacional.  
O banco mantém estado transacional.  
O runtime executa processos temporários.

## 2. Cadeia de valor

```text
Estratégia
    ↓
Objetivos
    ↓
Produtos
    ↓
Capabilities
    ↓
Contratos / APIs / Eventos
    ↓
Componentes / Pacotes
    ↓
Planos
    ↓
Clientes
    ↓
Tenants
    ↓
Projetos
    ↓
API Keys
    ↓
Uso
    ↓
Billing
    ↓
Receita
    ↓
Métricas
    ↓
Roadmap
```

Cada elo deve possuir identidade, status, owner, versão, dependências e evidências.

## 3. Domínios da empresa

### Estratégia
Define missão, visão, posicionamento, princípios, objetivos, mercado e prioridades.

### Produto
Define catálogo, público, problemas resolvidos, capacidades, jornada, planos, preços e critérios de venda.

### Engenharia
Implementa contratos, componentes, pacotes, testes, pipelines, integrações, segurança e observabilidade.

### Operação
Mantém runbooks, incidentes, monitoramento, suporte, continuidade, rollback e evidências operacionais.

### Comercial
Gerencia aquisição, conversão, planos, propostas, parceiros, canais e expansão.

### Financeiro
Gerencia assinaturas, faturamento, recebíveis, inadimplência, custos, margem e receita recorrente.

### Governança
Define autoridade, gates, riscos, auditoria, políticas, ADRs, conformidade e critérios de lançamento.

### Conhecimento
Preserva decisões, arquitetura, estado, próximos passos, histórico e relacionamentos entre entidades.

## 4. Entidades canônicas

A plataforma deve reconhecer, no mínimo:

- Objective
- Product
- Capability
- Contract
- API
- Event
- Component
- Package
- Plan
- Customer
- Tenant
- Project
- API Key
- Usage Record
- Subscription
- Invoice
- Payment
- Release
- Metric
- Roadmap Item
- Policy
- Decision
- Evidence
- Incident
- Runbook

## 5. Regras de identidade

Cada entidade relevante deve declarar, quando aplicável:

- `id`
- `name`
- `description`
- `owner`
- `status`
- `version`
- `created_at`
- `updated_at`
- `dependencies`
- `relations`
- `source`
- `evidence`
- `risk`
- `next_review`

IDs devem ser estáveis, opacos quando necessário e independentes de nomes pessoais.

## 6. Fontes de verdade

### Git
Fonte oficial para conhecimento permanente e evolutivo:

- arquitetura;
- ADRs;
- contratos;
- políticas;
- catálogo de produtos;
- Capability Registry;
- critérios de lançamento;
- runbooks;
- estado consolidado;
- roadmap;
- documentação operacional.

### Banco de dados
Fonte oficial para estado transacional:

- clientes;
- tenants;
- usuários;
- projetos;
- assinaturas;
- consumo;
- faturamento;
- pagamentos;
- permissões;
- eventos;
- auditoria operacional.

### Runtime
Fonte para estado temporário:

- sessões;
- filas;
- jobs;
- locks;
- cache;
- tentativas;
- contexto de execução.

### Portal
Interface que consulta, relaciona, governa e apresenta as fontes oficiais. Não deve ocultar origem, versão ou evidência.

## 7. Modelo de relacionamento

```text
Objective → Product
Product → Capability
Capability → Contract
Contract → Component
Component → Package
Capability → Plan
Plan → Customer
Customer → Tenant
Tenant → Project
Project → API Key
API Key → Usage
Usage → Billing
Billing → Revenue
Revenue → Metric
Metric → Roadmap
Decision → Evidence
Release → Capability
Incident → Runbook
```

Essas relações formam o Knowledge Graph operacional da empresa.

## 8. Portal de governança

O Portal deve evoluir para os seguintes módulos:

- Dashboard executivo
- Produtos
- Capabilities
- APIs e contratos
- Planos e pricing
- Clientes e tenants
- Projetos e API keys
- Uso e billing
- Receita e métricas
- Roadmaps
- Releases
- Operações e incidentes
- Runbooks
- Governança e ADRs
- Knowledge Graph
- Auditoria

Cada tela deve indicar fonte, status, versão, última atualização e owner.

## 9. Estados e evidências

Estados como `implementado`, `testado`, `aprovado`, `publicado`, `faturado` e `ativo` exigem evidência correspondente.

Sem evidência, usar estados seguros como:

- rascunho;
- em revisão;
- preparado;
- pendente;
- bloqueado;
- não executado.

Conversas não são evidência suficiente de execução real.

## 10. Automação comercial completa

A plataforma só deve ser considerada pronta para venda automática quando o cliente conseguir, sem intervenção humana:

1. descobrir o produto;
2. cadastrar-se;
3. verificar a conta;
4. contratar e pagar;
5. receber tenant e projeto;
6. gerar API key;
7. acessar documentação;
8. acompanhar consumo;
9. alterar plano;
10. cancelar;
11. obter suporte;
12. receber faturamento e notificações.

Internamente, devem ser automáticos:

- provisioning;
- billing;
- suspensão e reativação;
- auditoria;
- monitoramento;
- notificações;
- atualização de status;
- reconciliação;
- tratamento de falhas previsíveis.

## 11. Continuidade operacional

Toda etapa relevante deve terminar com:

- documento atualizado;
- commit;
- evidência;
- estado atual;
- próximo passo;
- bloqueios;
- ações não executadas.

Uma nova conversa deve conseguir continuar o trabalho apenas lendo o repositório e as fontes operacionais autorizadas.

## 12. Segurança

É proibido:

- versionar segredos;
- expor credenciais;
- misturar dados entre tenants;
- registrar dados pessoais sem finalidade;
- afirmar execução sem prova;
- executar merge, deploy, release, cobrança, publicação ou ação destrutiva sem aprovação explícita;
- permitir que o Portal edite conhecimento permanente sem histórico e rastreabilidade.

## 13. Critério de maturidade

A empresa evolui pelos níveis:

1. Foundation
2. Core
3. Platform
4. Commercial
5. Enterprise

A maturidade deve ser medida por capacidade, não apenas por quantidade de código.

## 14. Documentos derivados obrigatórios

Este blueprint deve ser detalhado por:

- `COMPANY_OPERATING_SYSTEM.md`
- `COMPANY_KNOWLEDGE_ARCHITECTURE.md`
- `CONVERSATION_CONTINUITY_PROTOCOL.md`
- `EXECUTIVE_DASHBOARD.md`
- `CURRENT_STATE.md`
- `NEXT_ITERATION.md`
- `KNOWN_DEBTS.md`
- `PLATFORM_CAPABILITY_REGISTRY.md`
- `PLATFORM_MATURITY_MODEL.md`
- `CUSTOMER_JOURNEY.md`
- `AUTOMATION_MATRIX.md`
- `READY_FOR_SALE.md`
- `LAUNCH_CHECKLIST.md`

## 15. Próxima evolução

A sequência recomendada é:

1. criar `CURRENT_STATE.md`;
2. criar `NEXT_ITERATION.md`;
3. criar `KNOWN_DEBTS.md`;
4. criar `PLATFORM_CAPABILITY_REGISTRY.md`;
5. criar o índice estruturado de documentos;
6. definir schemas consumíveis pelo Portal;
7. conectar Git, banco, runtime e Portal com rastreabilidade.

## 16. Regra final

> Estratégia orienta produtos. Produtos agrupam capacidades. Capacidades são implementadas por contratos e componentes. Planos comercializam capacidades. Clientes geram uso. Uso gera billing. Billing gera receita. Receita e métricas orientam o próximo roadmap. Tudo deve ser versionado, relacionado e auditável.
