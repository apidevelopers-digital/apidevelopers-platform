# Contrato de Modais e Drawers do Portal

**Status:** proposta modular de componente  
**Escopo:** detalhes temporários, preparação, confirmação e decisões assistidas  
**Não altera:** autoridade, aprovação ou execução

## 1. Uso

Modal é reservado para decisão focada ou confirmação. Drawer é usado para detalhe contextual sem abandonar a superfície principal.

## 2. Propriedades

```text
title
description
open
size
mode
dismissible
returnFocusTo
primaryAction
secondaryActions[]
riskLevel
sourceRef
```

## 3. Regras

- título e objetivo são explícitos;
- foco entra e retorna ao acionador;
- Escape fecha somente quando seguro;
- conteúdo crítico não depende de rolagem invisível;
- confirmação sensível mostra escopo, impacto e reversibilidade;
- fechar nunca equivale a aprovar ou cancelar operação remota.

## 4. Modos

- detail;
- review;
- approval;
- explicit-confirmation;
- destructive-confirmation;
- evidence-inspection.

## 5. Critérios de aceitação

- nenhum modal abre outro modal para a mesma decisão;
- drawers preservam seleção e filtros;
- confirmação usa verbo e objeto;
- alterações materiais invalidam aprovação anterior;
- segredos não aparecem no conteúdo.
