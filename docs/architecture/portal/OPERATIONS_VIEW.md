# Visão Operacional do Portal

**Status:** proposta modular de interface  
**Escopo:** filas, estados, evidências e ações assistidas  
**Não altera:** governança, autoridade, contratos institucionais ou gates existentes

## 1. Objetivo

A visão operacional transforma projeções canônicas em uma superfície de trabalho auditável para o `uni. Operador`.

Ela deve permitir:

- localizar rapidamente o que exige atenção;
- distinguir leitura, preparação, aprovação e execução;
- identificar ausência, atraso ou conflito de evidências;
- preservar a origem de cada afirmação exibida;
- encaminhar o operador para a próxima ação permitida;
- impedir que estados derivados sejam apresentados como fatos canônicos.

## 2. Estrutura da tela

```text
Cabeçalho de contexto
Resumo operacional
Fila principal
Painel de detalhes
Evidências
Histórico
Ações permitidas
```

O cabeçalho mantém visíveis:

- branch e revisão de origem;
- instante da projeção;
- estado de reconciliação;
- escopo ou domínio selecionado;
- filtros ativos;
- identidade e permissões do operador.

## 3. Resumo operacional

O resumo apresenta contagens navegáveis:

| Grupo | Exemplos |
|---|---|
| Atenção | bloqueados, divergentes, desatualizados |
| Pendentes | aguardando evidência, revisão ou aprovação |
| Preparados | propostas e ações em dry-run |
| Concluídos | itens com evidência válida |
| Desconhecidos | projeção insuficiente ou fonte indisponível |

Cada contagem abre a fila já filtrada. Nenhum agregado pode esconder itens desconhecidos.

## 4. Fila principal

Cada item da fila contém:

- título curto;
- domínio;
- estado operacional;
- prioridade derivada;
- última atualização;
- `SourceRef`;
- idade da projeção;
- gate atual;
- próxima ação permitida;
- indicador de divergência.

A prioridade organiza a leitura, mas não altera autoridade, gate ou estado canônico.

## 5. Painel de detalhes

Ao selecionar um item, o painel lateral ou página de detalhe mostra:

1. resumo da projeção;
2. estado atual e motivo;
3. dependências;
4. gates;
5. evidências;
6. divergências;
7. histórico;
8. ações permitidas.

O painel nunca mistura dados de itens diferentes sem indicar explicitamente a correlação.

## 6. Separação das ações

As ações são organizadas em quatro grupos:

| Grupo | Exemplos |
|---|---|
| Leitura | abrir fonte, copiar identificador, exportar visão |
| Preparação | gerar proposta, preparar dry-run, reunir evidências |
| Aprovação | solicitar aprovação, registrar decisão autorizada |
| Execução sensível | disponível somente quando gate e ferramenta permitirem |

A aparência de uma ação sensível deve informar:

- autoridade necessária;
- evidências obrigatórias;
- impacto;
- reversibilidade;
- confirmação exigida;
- estado atual do gate.

## 7. Estados de indisponibilidade

Quando uma projeção falhar, a interface diferencia:

- fonte indisponível;
- permissão insuficiente;
- dado ainda não projetado;
- projeção desatualizada;
- divergência não reconciliada;
- erro técnico confirmado.

A interface não substitui esses estados por zero, vazio ou saudável.

## 8. Atualização

Atualizações podem ocorrer por recarga manual, reconciliação concluída ou novo snapshot publicado.

O Portal deve mostrar:

- início e fim da atualização;
- fontes consultadas;
- fontes não consultadas;
- instante do snapshot;
- resultado da reconciliação;
- mudança de estado causada pela atualização.

## 9. Critérios de aceitação

- todo item aponta para uma origem verificável;
- ações de leitura e execução estão visualmente separadas;
- ausência de evidência permanece visível;
- filtros não alteram estados;
- prioridade não altera gates;
- o operador consegue chegar da fila à evidência em até duas transições;
- nenhum estado derivado é apresentado como decisão institucional.
