# Navegacao do Portal

**Status:** proposta modular de experiencia  
**Escopo:** arquitetura de informacao e rotas conceituais  
**Nao define:** framework, roteador ou implementacao de frontend

## 1. Estrutura principal

```text
Visao geral
Operacao
  |- Atividade
  |- Gates
  |- Divergencias
  `- Evidencias
Dominios
  |- Tenants
  |- Projetos
  |- API Keys
  |- Uso e limites
  |- Billing
  `- Ativacao
Arquitetura
  |- Componentes
  |- Contratos
  |- Projecoes
  `- Dependencias
Auditoria
  |- Eventos
  |- Aprovacoes
  `- Historico
Configuracao
```

Itens so aparecem quando existe projecao correspondente e permissao de leitura.

## 2. Rotas conceituais

| Rota | Finalidade |
|---|---|
| `/` | visao geral |
| `/operations` | fila operacional consolidada |
| `/operations/gates` | gates e checks |
| `/operations/divergences` | reconciliacao |
| `/domains` | catalogo de dominios |
| `/domains/:domainId` | visao de um dominio |
| `/architecture` | mapa arquitetural derivado |
| `/audit` | historico e evidencias |
| `/settings` | preferencias da superficie |

As rotas sao conceitos de produto, nao contrato tecnico de implementacao.

## 3. Contexto persistente

O cabecalho deve manter visivel:

- ambiente ou contexto consultado;
- branch ou revisao de origem;
- instante da projecao;
- status de reconciliacao;
- identidade e escopo do operador.

Mudancas de contexto exigem confirmacao visual clara.

## 4. Navegacao por estado

Itens bloqueados, divergentes ou com falha devem ser alcancaveis pela visao geral, filtros globais, atalhos do cabecalho, links dos dashboards e busca.

Nenhum alerta critico pode depender de uma unica rota.

## 5. Busca

A busca aceita identificadores, dominios, componentes, contratos, commits, evidencias e eventos auditaveis. Resultados indicam tipo, origem, estado e ultima atualizacao.

## 6. Breadcrumbs

Toda pagina de detalhe mostra origem da navegacao, hierarquia atual, contexto ativo e caminho de retorno sem perda de filtros.

## 7. Acoes globais

Acoes globais ficam restritas a atualizar projecoes, abrir documentacao, exportar leitura, preparar proposta e solicitar aprovacao.

Merge, release, deploy e publicacao nao fazem parte da navegacao documental atual.

## 8. Criterios de aceite

- leitura e operacao aparecem separadas;
- o contexto ativo permanece visivel;
- alertas criticos possuem multiplos caminhos;
- detalhes preservam filtros e contexto;
- nenhuma rota implica execucao sensivel automatica.
