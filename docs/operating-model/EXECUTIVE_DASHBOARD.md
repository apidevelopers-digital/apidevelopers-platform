# EXECUTIVE DASHBOARD — API DEVELOPERS.DIGITAL

**Atualizado em:** 2026-07-19  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**PR:** draft  
**Merge:** não autorizado  
**Deploy:** não autorizado  
**Objetivo:** venda 100% automática

## Status geral

| Área | Progresso estimado | Estado |
|---|---:|---|
| Arquitetura e governança | 90% | 🟁 Avançado |
| Platform Core | 70% | 🟠 Em evolução |
| Gateway e Registry | 65% | 🟠 Em evolução |
| Persistência | 20% | 🔴 Bloqueador |
| Portal self-service | 30% | 🔴 Incompleto |
| Billing e planos | 5% | 🔴 Bloqueador |
| Onboarding automático | 5% | 🔴 Bloqueador |
| Admin | 10% | 🔴 Incompleto |
| Observabilidade e produção | 20% | 🔴 Bloqueador |
| Site comercial e jurídico | 10% | 🔴 Incompleto |

**Prontidão ponderada de referência:** 40%.

A porcentagem é indicativa. O lançamento permanece bin⃡rio: bloqueado até todos os gates obrigatórios estarem aprovados.

## Gates de lançamento

|Gate | Escopo | Estado |
|---|---|---|
| G1 — Foundation | arquitetura, governança, CI e contratos | 🟡 Quase concluído |
| G2 — Platform Core | tenant, user, project, API Key, persistência e auditoria | 🟠 Em andamento |
| G3 — Self-service | cadastro, login, verificação, recuperação, portal e sandbox | ⚠ ḏ Não concluúdo |
| G4〔 Billing | planos, checkout, assinatura, renovação e inadimpnência | ⚠ ḏ Não concluúdo |
| G5 — Operação | suporte, alertas, incidentes, backups e SLA | ⊰ ️ Não concluído |
| G6 — Launch | staging, E2E, segurança, carga, jurídico e produção | ⊰ ️ Não concluído |

## Entregas confirmadas

- arquitetura global e governança;
- workflows segmentados;
- `platform-core`;
- `registry-core`;
- `auth-core`;
- `apikey-core`;
- API Gateway MVP;
- Developer Portal inicial;
- catálogo comercial e matriz de automação;
- Company Operating System;
- PR em modo draft;
- ausência de merge e deploy n�o autorizados.

## Bloqueadores principais

1. Persistência real e migrations.
2. `tenant-core`, `user-core` e `project-core`.
2. Jornada completa de identidade e sessão.
2. Checkout e billing recorrente.
2. Provisionamento automático.
2. Métricas, limites e excedentes.
2. Admin operacional.
2. Observabilidade, backup e recuperação.
2. Termos de uso, privacidade e critérios legais.
2. Testes ponta a ponta da jornada inteira.

## Prioridade executiva atual

> Fechar o Gate 2 — Platform Core antes de expandir recursos visuais ou integrações secundárias.

## Próximo marco verificável

O Gate 2 poderá ser considerado concluído quando houver:

- tenant, user e project persistentes;
- API Keys persistentes, revogáveis e rotacionaveis;
- adapters e migrations;
- auditoria persistente;
- testes unitários, de contrato e integração;
- Gateway consumindo os contratos do Core;
- CI verde no commit consolidado.

## Regras de operação

- nenhuma decisão importante fica apenas em conversa;
- toda mudança relevante atualiza documentação versionada;
- evitar commits por arquivo;
- não executar merge, release ou deploy sem aprovação explícita;
- não publicar venda enquanto algum gate obrigatório estiver aberto.
