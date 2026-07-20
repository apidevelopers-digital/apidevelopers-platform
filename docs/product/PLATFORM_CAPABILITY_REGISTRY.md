# PLATFORM CAPABILITY REGISTRY

**Status:** Canônico — versão inicial  
**Versão:** 0.1.0  
**Atualizado em:** 2026-07-20  
**Branch de referência:** `foundation/global-platform-bootstrap-20260715`  
**Responsável:** Produto / Arquitetura  
**Fonte de verdade:** Git

## 1. Objetivo

Este documento é o registro canônico das capacidades da plataforma API Developers.Digital.

Ele conecta estratégia, produto, APIs, componentes, operação, evidências, maturidade e prontidão comercial.

Uma capacidade só pode ser tratada como real quando seu comportamento, responsável, dependências, evidências e estado operacional forem conhecidos.

## 2. Regra permanente

> Conversa propõe. Git registra. CI valida. Portal governa. Operações executam.

Nenhuma capacidade deve ser anunciada como pronta apenas porque existe código. Prontidão exige evidência técnica, operacional, comercial e de segurança.

## 3. Modelo de identificação

Cada capacidade recebe um identificador estável:

`CAP-<DOMINIO>-<NUMERO>`

Exemplos:

- `CAP-TENANT-001`
- `CAP-USER-001`
- `CAP-PROJECT-001`
- `CAP-USAGE-001`

Campos obrigatórios:

| Campo | Definição |
|---|---|
| ID | Identificador canônico e imutável |
| Nome | Nome funcional da capacidade |
| Domínio | Área de responsabilidade |
| Descrição | Resultado entregue |
| Estado | Proposta, Em construção, Implementada, Validada, Operacional, Comercial |
| Maturidade | M0 a M5 |
| Dono | Responsável funcional e técnico |
| Dependências | Capacidades necessárias |
| Evidências | Código, testes, CI, documentação e operação |
| Exposição | Interna, API, Portal ou produto |
| Comercializável | Sim ou não |
| Bloqueadores | Pendências objetivas |

## 4. Escala de maturidade

| Nível | Significado |
|---|---|
| M0 | Conceito registrado |
| M1 | Contrato ou manifesto definido |
| M2 | Implementação inicial |
| M3 | Testes e CI segmentada |
| M4 | Persistência, segurança e observabilidade operacionais |
| M5 | Comercializável, automatizada e suportada |

## 5. Registro atual

### CAP-TENANT-001 — Gestão de tenants

- **Domínio:** Tenant Core
- **Descrição:** criar, identificar e gerenciar o ciclo de vida de tenants.
- **Estado:** Validada em camada de domínio
- **Maturidade:** M3
- **Exposição:** Interna / futura API
- **Comercializável:** Não
- **Dependências:** identidade, persistência, auditoria
- **Evidências esperadas:** manifesto, implementação, testes, CI e documentação do domínio
- **Bloqueadores:** persistência real, migrations, isolamento entre tenants, auditoria e integração com gateway

### CAP-USER-001 — Gestão de usuários

- **Domínio:** User Core
- **Descrição:** registrar e gerenciar usuários vinculados ao contexto da plataforma.
- **Estado:** Validada em camada de domínio
- **Maturidade:** M3
- **Exposição:** Interna / futura API
- **Comercializável:** Não
- **Dependências:** Tenant Core, identidade, autorização
- **Evidências esperadas:** manifesto, implementação, testes, CI e documentação do domínio
- **Bloqueadores:** persistência real, autenticação, autorização, recuperação de conta e auditoria

### CAP-PROJECT-001 — Gestão de projetos

- **Domínio:** Project Core
- **Descrição:** criar e administrar projetos, slugs e estados de ciclo de vida.
- **Estado:** Validada em camada de domínio
- **Maturidade:** M3
- **Exposição:** Interna / futura API
- **Comercializável:** Não
- **Dependências:** Tenant Core, User Core, persistência
- **Evidências:** manifesto, implementação, documentação, testes e CI segmentada
- **Bloqueadores:** persistência real, migrations, autorização, auditoria e integração com API Gateway

### CAP-USAGE-001 — Medição de uso

- **Domínio:** Usage Core
- **Descrição:** registrar eventos de uso, garantir idempotência e produzir agregações por janela.
- **Estado:** Validada em camada de domínio
- **Maturidade:** M3
- **Exposição:** Interna / futura API e Portal
- **Comercializável:** Não
- **Dependências:** Tenant Core, Project Core, identidade de API, relógio confiável
- **Evidências:** manifesto, implementação, documentação, testes e CI verde no HEAD conferido
- **Bloqueadores:** persistência, ingestão durável, retenção, quotas, reconciliação, observabilidade e integração com billing

## 6. Capacidades prioritárias ainda não registradas como implementadas

| ID provisório | Capacidade | Estado |
|---|---|---|
| CAP-APIKEY-001 | emissão, rotação e revogação de API Keys | Proposta |
| CAP-AUTH-001 | autenticação e autorização | Proposta |
| CAP-AUDIT-001 | trilha de auditoria persistente | Proposta |
| CAP-BILLING-001 | cobrança, reconciliação e ciclo financeiro | Proposta |
| CAP-PROVISION-001 | provisionamento automático | Proposta |
| CAP-GATEWAY-001 | exposição e governança de APIs | Proposta |
| CAP-NOTIFY-001 | notificações operacionais e comerciais | Proposta |
| CAP-SUPPORT-001 | suporte, incidentes e recuperação | Proposta |
| CAP-PORTAL-001 | autosserviço do cliente | Proposta |
| CAP-OBS-001 | métricas, logs, tracing e alertas | Proposta |

Esses identificadores só se tornam definitivos quando o respectivo manifesto ou contrato for registrado no Git.

## 7. Critério de promoção

Uma capacidade pode avançar:

- de M0 para M1 quando houver contrato ou manifesto aprovado;
- de M1 para M2 quando houver implementação rastreável;
- de M2 para M3 quando testes e CI estiverem verdes;
- de M3 para M4 quando persistência, segurança, auditoria e observabilidade estiverem operacionais;
- de M4 para M5 quando a jornada comercial for automática, mensurável, suportada e autorizada.

## 8. Gate comercial

Uma capacidade só pode ser marcada como comercializável quando:

1. possuir contrato estável;
2. tiver isolamento e segurança comprovados;
3. apresentar SLOs e monitoramento;
4. possuir billing ou regra explícita de gratuidade;
5. ter documentação pública;
6. permitir suporte e recuperação;
7. possuir evidência de CI e operação;
8. integrar a jornada automática do cliente;
9. estar associada a produto e plano;
10. receber autorização explícita de promoção.

## 9. Relações futuras no Portal

Cada capacidade deverá se relacionar com:

- produtos;
- planos;
- APIs;
- componentes;
- repositórios;
- owners;
- clientes;
- métricas;
- incidentes;
- riscos;
- decisões arquiteturais;
- workflows;
- evidências;
- versões e releases.

## 10. Governança

- O Git é a fonte de verdade.
- Alterações de estado exigem evidência.
- Mudanças incompatíveis exigem decisão arquitetural.
- Capacidade sem owner não pode avançar para M4.
- Capacidade sem operação e suporte não pode avançar para M5.
- Merge, release e deploy permanecem sujeitos à aprovação explícita.

## 11. Próximo passo

1. validar este registro contra os manifests existentes;
2. criar o `ENTITY_REGISTRY_SPEC.md`;
3. modelar as relações no `KNOWLEDGE_GRAPH_MODEL.md`;
4. definir o consumo pelo Portal em `PORTAL_DATA_MODEL.md`;
5. atualizar o registro a cada nova capacidade implementada.
