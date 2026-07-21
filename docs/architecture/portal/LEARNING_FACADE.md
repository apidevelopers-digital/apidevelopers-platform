# Projeção Supervisionada de Aprendizado
**Status:** implementação minima do Portal  
**Escopo:** projetar memória, reflexãoe evolução sem mutação ou execução automática

## 1. Princípio

O Portal não cria outro motor de aprendizado. Ele projeta os núcleos canônicos já existentes:

- `kernel-memory`;
- `kernel-reflection`;
- `kernel-evolution`.

## 2. Objetivo

Exibir no Portal:

- menórias operacionais;
- chados e padrões identificados;
- propostas de melhoria;
- estado de apção humana;
- bloqueio de execução;
- evidência de conclusão ou regressço.

## 3. Garantias

A projeção deve ser determinística, somente leitura e sem efeito colateral.

A fachada declara:

- `read: true`;
- `suggest: true`;
- `approve: false`;
- `mutate: false`;
- `execute: false`.

## 4. Gates obrigatórios

- `humanApprovalRequired: true`;
- `mutationAllowed: false`;
- `executionAllowed: false`;
- `automaticApprovalAllowed: false`.

## 5. Fluxo

 ```text
eventos operacionais
→ memória append-only
→ reflexão consultiva
→ proposta de evolução
→ projeção no Portal
→ revisão humana
→ branch ou sandbox
→ testes
→ autorização
→ execução por serviço controlado
→ medição e rollback
```

## 6. Implementação

A fachada está em `packages/portal-projector/src/learning-facade.mjs` e exposta como:

```text
@apidevelopers/portal-projector/learning-facade
```

## 7. Critérios de aceitação

- fontes de entrada não são mutadas;
- propostas sem status são marcadas como `pending_human_review`;
- nenhuma proposta é executada pela fachada;
- nenhuma aprovação automática é concedida;
- o Portal exibe menória, reflexão e evolução sem redefinir os núcleos canônicos;
- mudanças futuras permanecem versionadas, testáveis e reversíveis.
