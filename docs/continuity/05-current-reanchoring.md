# Reancoragem atual — API Developers.digital

Data: 2026-07-23
Status: ATUAL
Substitui como direção operacional a reancoragem de 16/07/2026. O documento antigo permanece apenas como histórico.

## 1. Produto em desenvolvimento

A frente atual é a API Developers.digital, no repositório:

- organização: `apidevelopers-digital`
- repositório: `apidevelopers-platform`
- branch estrutural: `foundation/global-platform-bootstrap-20260715`
- branch de correção técnica: `fix/main-planning-engine-shim-20260723`
- branch desta documentação: `docs/continuity-audit-20260723`

A plataforma é uma base global, multi-tenant, composta por contratos, packages, engines, services, apps, gateway, catálogo comercial, automação, billing, observabilidade e operação.

## 2. Objetivo real atual

Consolidar uma plataforma vendável e operável de ponta a ponta:

visita -> cadastro -> verificação -> plano -> pagamento -> tenant -> projeto -> API key -> uso -> medição -> limites -> cobrança -> suporte -> upgrade/downgrade/cancelamento/reativação.

A venda permanece bloqueada até os gates ponta a ponta ficarem verdes.

## 3. Base já existente

A branch de fundação já contém:

- estrutura global do repositório;
- catálogo comercial e matriz de automação;
- contratos e arquitetura;
- apps, engines, services e packages;
- packages de identidade, autenticação, tenant, projeto, API keys, gateway, registry, planos, billing, provisioning, usage, limits e outros;
- componentes de kernel e governança;
- testes e scripts operacionais.

A existência do diretório não significa conclusão funcional. O status deve ser medido por jornada e gates.

## 4. Frente técnica atual

A frente desta continuidade é estabilização e reconciliação da base:

1. corrigir o `planning-engine` legado quebrado;
2. validar sintaxe e importação;
3. executar CI no runner canônico do Mac;
4. documentar a política do runner;
5. preparar integração segura sem merge forçado;
6. manter o PR estrutural grande em draft até reconciliação.

Estado:

- planning engine corrigido;
- CI aprovado no `igor-mac-runner`;
- runner canônico salvo como `[self-hosted, macOS, X64]`;
- PR #16 tecnicamente validado;
- integração na branch principal ainda pendente de governança;
- PR #15 continua grande, draft e conflitado;
- nenhum merge ou deploy executado.

## 5. Percentuais

### Desenvolvimento total da plataforma

Estimativa técnica atual: **40%**, com faixa de confiança de **35% a 45%**.

Base:
- o catálogo comercial versionado mede a jornada por áreas ponderadas e registra aproximadamente 40%;
- arquitetura, core, gateway e registry estão mais avançados;
- persistência, portal, billing, onboarding, comunicação, suporte, observabilidade, produção, site comercial, jurídico e testes E2E ainda têm lacunas relevantes;
- a venda automática continua bloqueada.

Este percentual mede prontidão ponta a ponta, não quantidade de arquivos.

### Frente atual desta continuidade

Estimativa: **85%**.

Critério:
- repositório canônico identificado: concluído;
- planning engine corrigido: concluído;
- workflow criado e corrigido: concluído;
- execução no runner Mac: concluída;
- política do runner: concluída;
- documentação de continuidade: concluída em microblocos;
- integração final do PR #16: pendente;
- reconciliação segura do PR #15: pendente.

A frente não chega a 100% antes da integração governada e da conferência pós-integração.

## 6. Runner canônico

- nome: `igor-mac-runner`
- labels: `self-hosted`, `macOS`, `X64`

Configuração:

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

Não usar runner hospedado por padrão.

## 7. Próxima ordem correta

1. concluir a governança e integração segura do PR #16;
2. conferir o estado resultante da branch alvo;
3. reavaliar e decompor o PR #15, evitando integração massiva e conflitada;
4. atualizar a matriz de progresso com evidência do código atual;
5. retomar as lacunas da jornada comercial ponta a ponta, priorizando persistência, onboarding, billing e provisioning;
6. manter venda, merge, release e deploy bloqueados sem gate explícito.

## 8. Regra de continuidade

- não retomar “Onda 2” como direção atual;
- usar a jornada comercial e a matriz de automação como mapa de progresso;
- trabalhar em microcommits e microdocumentos verificáveis;
- não confundir presença de package com funcionalidade concluída;
- não afirmar merge, deploy ou produção sem evidência.
