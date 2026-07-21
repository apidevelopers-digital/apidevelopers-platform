# Ordem segura de incorporação — 2026-07-21

**Status:** plano de consolidação ativo  
**Base auditada:** `foundation/global-platform-bootstrap-20260715`  
**HEAD observado:** `8f68f555919ab571d32239b43249af0cb1385bcd`

## 1. Estado observado

- O Portal institucional phase 3 já está incorporado integralmente à foundation.
- A correção do architecture rule engine é um delta isolado de um arquivo.
- O ciclo integrado de aprendizado contém uma cadeia longa de commits e deve ser promovido seletivamente.
- A reancoragem documental deve refletir o estado técnico real e entrar por último.

## 2. Ordem recomendada

### Etapa 1 — Rule engine

Candidato limpo:

- branch: `consolidate/platform-rule-engine-20260721`
- commit: `34d583d600ae131094d193d3e293eebc65fbb20e`
- PR: `#6`
- escopo: `packages/architecture-rule-engine/src/adapters.mjs`

Condição de incorporação:

1. CI aplicável verde;
2. revisão do delta de um arquivo;
3. aprovação explícita;
4. merge controlado.

### Etapa 2 — Aprendizado supervisionado

Fonte auditada:

- branch: `work/portal-learning-integrated-cycle-v2-20260721`
- HEAD: `da8551ee7ab0b0f63c98a8315f324a17f8bb79b4`

Estratégia:

1. criar branch limpa a partir do HEAD atual da foundation;
2. portar apenas oc ciclo final integrado;
3. excluir branches intermediárias já supersedidas;
4. preservar contratos e testes finais;
5. validar CI integrado;
6. abrir PR draft independente.

Não executar merge bruto da branch histórica.

### Etapa 3 — Reancoragem e coordenação

Fonte:

- branch: `docs/institutional-chat-reanchoring-20260721`
- PR: `#3`

A documentação entra depois das frentes técnicas para registrar:

- Portal já consolidado.
- regra vigente do Portal unificado;
- ordem de precedência;
- percentuais recalculados;
- branches supersedidas;
- capacidade realmente disponível.

## 3. Frentes fora da fila imediata

### Portal unificado

Estado: `consolidada`

A branch `work/portal-institutional-phase3-20260721` já foi absorvida pela foundation. Não criar nova PR para o mesmo conteúdo.

### Operações e integrações

Estado: `validada-isoladamente`

Aguardar mapa de dependências com catålogo, checkout, billing e entitlement.

## 4. Regra de segurança

Nenhuma etapa autoriza automaticamente:

- merge;
- release;
- deploy;
- exclusão de branches;
- alteração de produção.

## 5. Próximo passo único

Obter CI aplicável e revisão da PR #6. Em paralelo, preparar o inventário seletivo dos arquivos finais do ciclo integrado de aprendizado.
