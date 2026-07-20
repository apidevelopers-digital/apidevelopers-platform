# PORTAL DATA MODEL

**Status:** Canônico — versão inicial  
**Versão:** 0.1.0  
**Atualizado em:** 2026-07-20  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Responsável:** Produto / Arquitetura  
**Fonte de verdade:** Git

## 1. Objetivo

Este documento define como o Portal deve ler, organizar, representar e operar sobre o grafo institucional sem criar uma segunda fonte de verdade.

O Portal existe para facilitar navegação, governança, continuidade e operação assistida.

## 2. Princípio central

> Git é a memória institucional e a fonte canônica. O Portal lê, projeta, organiza e opera, mas não cria uma verdade paralela.

## 3. Regras iniciais

1. Todo dado exibido deve apontar para uma origem versionada.
2. Nenhum estado pode ser declarado sem evidência.
3. O Portal não inventa IDs, capacidades, entidades ou relações.
4. Dados derivados devem ser reproduzíveis a partir do Git.
5. Alterações sensíveis exigem aprovação e trilha de auditoria.
6. Divergências devem ser exibidas, nunca ocultadas.

## 4. Cadeia de derivação

```text
Git e documentos canônicos
→ extrator e validador
→ grafo institucional derivado
→ índice de consulta
→ API do Portal
→ visões, dashboards e ações assistidas
```

## 5. Evolução por microcommits

Este documento deve ser expandido em blocos temáticos curtos, cada um com commit próprio.

Sequência prevista:

1. objetos do modelo;
2. referência de origem;
3. evidência, estado e bloqueadores;
4. ações, aprovações e auditoria;
5. projeções de interface;
6. reconciliação com o Git;
7. API mínima;
8. critérios de prontidão.

## 6. Regra permanente

> O Portal pode organizar, projetar, acelerar e operar. A verdade institucional continua versionada no Git.
