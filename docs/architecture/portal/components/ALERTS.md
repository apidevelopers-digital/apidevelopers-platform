# Contrato de Alertas do Portal

**Status:** proposta modular de componente  
**Escopo:** mensagens persistentes e transitórias de estado, risco e divergência  
**Não altera:** classificação institucional de risco ou gates

## 1. Tipos

- informative;
- attention;
- blocked;
- error;
- critical;
- divergent;
- unknown;
- success.

## 2. Propriedades

```text
title
message
severity
persistent
sourceRef
projectedAt
gateState
actions[]
correlationId
dismissible
```

## 3. Regras

- sucesso exige evidência válida;
- bloqueio informa gate e requisito ausente;
- divergência mostra os dois lados;
- desconhecido não é erro;
- alertas críticos não são descartáveis;
- mensagens transitórias não carregam estados críticos;
- cor nunca é o único sinal.

## 4. Acessibilidade

Alertas possuem papel semântico, título explícito, foco previsível e anúncio compatível com a urgência.

## 5. Critérios de aceitação

- causa, impacto e próxima ação aparecem quando aplicáveis;
- nenhum alerta expõe segredo;
- alertas persistem enquanto a condição existir;
- ações sensíveis permanecem separadas do fechamento do alerta.
