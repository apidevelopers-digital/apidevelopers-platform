# Contrato de Tabelas do Portal

**Status:** proposta modular de componente  
**Escopo:** filas, inventários, auditoria e comparação operacional  
**Não altera:** prioridade, estado, gate ou fonte de verdade

## 1. Propriedades

```text
columns[]
rows[]
rowKey
sort
filters
selection
density
loading
sourceRef
emptyState
```

## 2. Regras

- cada linha possui identificador estável;
- ordenação e filtros ficam visíveis;
- prioridade derivada não altera o estado canônico;
- seleção sobrevive a atualização segura;
- identificadores técnicos são copiáveis;
- tabelas compactas preservam estado, gate e temporalidade.

## 3. Estados

- loading;
- available;
- empty;
- partial;
- stale;
- error;
- unavailable;
- no-permission.

## 4. Responsividade

A tabela pode usar rolagem, redução de colunas ou lista estruturada. Nunca oculta estado ou gate sem expansão acessível.

## 5. Acessibilidade

Cabeçalhos são semânticos, ordenação é anunciada, navegação por teclado é suportada e gráficos associados possuem alternativa textual.

## 6. Critérios de aceitação

- vazio não equivale a sucesso;
- filtros não mutam dados;
- linhas atualizadas não deslocam silenciosamente o item em leitura;
- ações por linha seguem o contrato de botões.
