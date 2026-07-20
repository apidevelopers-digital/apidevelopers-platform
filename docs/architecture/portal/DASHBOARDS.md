# Dashboards do Portal

**Status:** proposta modular de interface  
**Escopo:** leitura e operacao assistida sobre projecoes canonicas  
**Nao altera:** governanca, contratos institucionais ou fonte de verdade

## 1. Principios

1. Todo indicador deve apontar para uma projecao e sua `SourceRef`.
2. Ausencia de evidencia nunca pode ser exibida como sucesso.
3. Estados desconhecidos, divergentes ou desatualizados permanecem visiveis.
4. Acoes sensiveis aparecem separadas de acoes de leitura.
5. O Portal nao executa merge, release, deploy ou publicacao por consequencia implicita.

## 2. Dashboard inicial

A visao inicial deve responder, nesta ordem:

1. O que esta saudavel?
2. O que exige atencao?
3. O que esta bloqueado?
4. O que mudou recentemente?
5. Qual e a proxima acao permitida?

| Bloco | Conteudo | Origem |
|---|---|---|
| Estado geral | contagem por estado operacional | projecao de status |
| Gates | checks concluidos, pendentes e falhos | workflows e evidencias |
| Mudancas recentes | commits, documentos e revisoes | historico Git |
| Divergencias | projecoes fora de sincronia | reconciliacao |
| Proximas acoes | acoes permitidas pelo estado atual | politica de interface |

## 3. Dashboard operacional

Voltado ao `uni. Operador`, com foco em decisao rapida:

- fila de itens pendentes;
- itens bloqueados por gate;
- operacoes em preparacao;
- evidencias mais recentes;
- acoes que exigem aprovacao explicita;
- historico auditavel da superficie selecionada.

Cada cartao deve exibir nome, estado, ultima atualizacao, origem, nivel de confianca, proxima acao permitida e link para evidencias.

## 4. Dashboard de dominio

Cada dominio reutiliza a mesma estrutura:

```text
Resumo
-> Estado atual
-> Dependencias
-> Eventos recentes
-> Evidencias
-> Divergencias
-> Acoes permitidas
```

O dominio nao pode inventar estados proprios incompatíveis com as projecoes compartilhadas.

## 5. Estados visuais

| Estado | Tratamento |
|---|---|
| saudavel | confirmacao com evidencia valida |
| atencao | dado parcial, atrasado ou incompleto |
| bloqueado | gate obrigatorio nao satisfeito |
| erro | falha confirmada |
| desconhecido | ausencia de evidencia suficiente |
| divergente | fontes derivadas nao reconciliadas |

Cor, icone e texto devem aparecer juntos. Cor isolada nao e suficiente.

## 6. Temporalidade

Toda visualizacao temporal mostra instante da projecao, instante da fonte, idade do dado e estado de reconciliacao. Dados antigos nao podem parecer atuais sem aviso explicito.

## 7. Criterios de aceite

- cada bloco possui projecao de origem definida;
- estados desconhecidos e divergentes tem tratamento proprio;
- acoes sensiveis estao isoladas;
- cada indicador permite chegar a evidencia;
- a visao inicial funciona sem depender de um dominio especifico.
