# Componentes de Interface do Portal

**Status:** catalogo inicial  
**Escopo:** componentes reutilizaveis orientados por projecoes  
**Nao define:** biblioteca visual ou tecnologia de implementacao

## 1. Componentes fundamentais

### `StatusBadge`

Exibe estado sem depender apenas de cor. Recebe `state`, `label`, `evidenceState` e `updatedAt`.

### `SourceRefLink`

Abre a origem canonica ou sua representacao auditavel. Recebe tipo, identificador, revisao, caminho e hash quando disponivel.

### `EvidencePanel`

Agrupa evidencias e distingue valida, ausente, expirada, conflitante e nao verificavel.

### `GateCard`

Resume estado, requisito, evidencia, responsavel e proxima acao permitida.

### `DivergenceBanner`

Informa divergencia entre fonte e projecao sem ocultar nenhum lado.

### `ProjectionTimestamp`

Mostra idade, origem e instante da projecao.

## 2. Componentes de composicao

### `OperationalSummary`

Agrupa contagens por estado e direciona aos filtros correspondentes.

### `ActivityTimeline`

Exibe commits, eventos, aprovacoes e reconciliacoes em ordem temporal.

### `DomainOverview`

Apresenta resumo, dependencias, evidencias e acoes permitidas de um dominio.

### `ActionPanel`

Separa acoes em leitura, preparacao, aprovacao e execucao sensivel. A execucao sensivel permanece desabilitada quando o gate nao estiver satisfeito.

### `EmptyState`

Nunca sugere sucesso quando nao existem dados. Explica o que esta ausente, por que importa, qual fonte e esperada e a proxima acao permitida.

## 3. Estados obrigatorios

Todo componente orientado a dados suporta:

- carregando;
- disponivel;
- vazio;
- desatualizado;
- divergente;
- bloqueado;
- erro;
- sem permissao.

## 4. Contrato de rastreabilidade

Componentes que exibem afirmacoes operacionais recebem ou derivam:

```text
value
state
sourceRef
evidence[]
projectedAt
reconciledAt
```

Sem `sourceRef`, o conteudo deve ser marcado como nao verificavel.

## 5. Acessibilidade

- texto acompanha cor e icone;
- foco visivel;
- navegacao por teclado;
- rotulos para leitores de tela;
- estados dinamicos anunciados;
- tabelas com cabecalhos semanticos;
- acoes sensiveis nunca dependem de gesto ambiguo.

## 6. Densidade

O Portal oferece densidade confortavel por padrao e compacta para operacao intensiva. A densidade nao pode ocultar evidencias, estados ou gates.

## 7. Criterios de aceite

- componentes compartilham os mesmos estados;
- toda afirmacao operacional e rastreavel;
- vazio nao equivale a saudavel;
- acoes sensiveis possuem separacao visual e gate;
- acessibilidade faz parte do contrato.
