# Zuni SaaS ↔ Shared Platform — Contract v1

**Data:** 2026-08-10  
**Status:** contrato técnico proposto para revisão  
**Produto:** Zuni  
**Plataforma compartilhada:** API Developers.digital Platform

## 1. Objetivo

Definir a fronteira técnica entre o domínio Zuni e as capacidades SaaS compartilhadas da API Developers.digital.

O backend `apidevelopers-digital/unico-api-platform` permanece como backend operacional atual do Zuni enquanto a migração ocorrer de forma incremental. A presença deste contrato não comprova migração de runtime.

## 2. Responsabilidades da plataforma compartilhada

A plataforma deve oferecer contratos reutilizáveis para:

- `identity`
- `organization`
- `tenant`
- `workspace`
- `user`
- `role`
- `permission`
- `session`
- `subscription`
- `entitlement`
- `billing`
- `provisioning`
- `audit`
- `observability`
- `files`
- `notifications`
- `feature_flags`

Esses contratos devem ser independentes do provedor de canal e reutilizáveis por outros produtos SaaS.

## 3. Responsabilidades do domínio Zuni

Zuni permanece proprietário de:

- conversations;
- messages;
- contacts;
- inbox;
- WhatsApp templates;
- Meta channel configuration;
- delivery/read status;
- media vinculada a conversas;
- regras específicas de atendimento;
- diagnósticos do produto;
- UX Web/mobile;
- integração contextual com `uni.co`;
- trilha de auditoria de operações específicas do produto.

## 4. Identificadores canônicos

Operações SaaS do Zuni devem convergir para identificadores explícitos:

- `tenant_id`
- `workspace_id`
- `user_id`
- `product_id = "zuni"`
- `subscription_id`
- `correlation_id`
- `channel_id`
- `audit_event_id`

IDs de WABA, phone number, app Meta ou provedores externos não substituem `tenant_id` nem `workspace_id`.

## 5. Estados comerciais mínimos

Uma assinatura Zuni deve poder representar, no mínimo:

- `lead`
- `assisted_activation`
- `trial`
- `active`
- `past_due`
- `suspended`
- `cancelled`

Estado comercial e autorização de uso não devem ser inferidos apenas pela existência de usuário ou canal.

## 6. Entitlements

Entitlements devem ser derivados de assinatura/plano e consumidos pelo produto de forma verificável.

Exemplos de capacidade:

- número de workspaces;
- número de canais;
- usuários/assentos;
- recursos de templates;
- recursos de automação futuros;
- retenção e limites operacionais;
- recursos premium específicos de plano.

A matriz definitiva de limites comerciais deve ser versionada separadamente.

## 7. Provisioning

Provisioning deve ser uma operação idempotente e observável.

Resultado esperado de um provisioning completo:

1. tenant materializado;
2. workspace inicial materializado;
3. administrador vinculado;
4. assinatura vinculada;
5. entitlements materializados;
6. configuração inicial do produto criada;
7. integração/canal solicitado conectado ou deixado em estado explícito de pendência;
8. health/readiness registrado;
9. evento de auditoria persistido.

Falha parcial deve produzir estado recuperável, nunca sucesso implícito.

## 8. Integração com canais

Zuni não deve acoplar tenancy ao número WhatsApp.

A relação-alvo é:

`tenant → workspace → channel → provider account/phone`

5001 e 6610 permanecem canais piloto, não tenants.

## 9. Integração de inteligência

`uni.co` é um agente institucional federado. Zuni deve enviar contexto mínimo governado e receber respostas/rascunhos por contrato.

Templates gerados ou assistidos por `uni.co` continuam exigindo revisão humana antes de submissão Meta ou envio quando a política vigente assim exigir.

## 10. Migração incremental

A migração do backend atual para capacidades compartilhadas deve:

- inventariar dependências antes de substituir;
- introduzir contratos antes de mover estado;
- permitir dual-read/alias quando necessário;
- manter idempotência;
- preservar auditoria;
- testar rollback;
- evitar renomeação massiva de paths/variáveis legadas sem necessidade;
- comprovar cada etapa em staging/piloto antes da retirada do legado.

## 11. Próximos contratos a materializar

Primeiro conjunto recomendado:

1. `Tenant`
2. `Workspace`
3. `Subscription`
4. `Entitlement`
5. `ProvisioningJob`

Cada contrato deve possuir schema versionado, validação e testes.

## 12. Limites

Este documento não implementa runtime, banco, billing, provisioning ou migração.

Nenhuma escrita em produção, deploy, cobrança, mensagem, ação Meta ou remoção de legado é autorizada por este contrato.
