# Densidade Operacional do Portal

**Status:** proposta modular de interface  
**Escopo:** quantidade, hierarquia e compactação de informação  
**Não altera:** estados canônicos, prioridades, gates ou autoridade

## 1. Objetivo

A densidade deve acelerar leitura e comparação sem esconder origem, evidência ou risco.

Compactar não significa:

- reduzir legibilidade;
- remover contexto;
- ocultar divergências;
- condensar múltiplos estados em um;
- aproximar ações sensíveis de controles comuns.

## 2. Modos de densidade

| Modo | Uso |
|---|---|
| confortável | leitura, onboarding e análise detalhada |
| padrão | uso cotidiano e equilíbrio entre leitura e volume |
| compacto | filas extensas e operação intensiva |
| monitoramento | visão ampla com baixa interação |

A escolha de densidade é preferência de interface. Ela não altera dados, filtros, prioridade ou gates.

## 3. Elementos invariantes

Em qualquer modo permanecem visíveis:

- identificação;
- estado;
- gate;
- prioridade derivada;
- idade da projeção;
- divergência;
- próxima ação permitida.

Origem e evidências podem usar expansão no modo compacto, desde que permaneçam acessíveis em uma transição.

## 4. Filas

### Confortável

Cada item pode mostrar:

- título;
- resumo;
- estado;
- origem;
- atualização;
- gate;
- evidências;
- próxima ação.

### Padrão

Preserva os campos críticos e reduz descrições secundárias.

### Compacto

Usa uma linha ou bloco curto com:

- identificação;
- estado;
- gate;
- idade;
- prioridade;
- indicador de divergência.

O item selecionado expande detalhes sem perder posição na fila.

## 5. Tabelas

A densidade pode alterar:

- altura das linhas;
- espaçamento;
- quantidade de metadados visíveis;
- número de colunas iniciais.

Não pode alterar:

- conteúdo do estado;
- ordenação ativa;
- filtros;
- interpretação das colunas;
- presença de alertas críticos.

## 6. Cartões

Cartões devem ser usados quando a relação entre campos é mais importante que comparação entre linhas.

No modo compacto, evitar grades de cartões para listas extensas. Preferir linhas estruturadas.

## 7. Hierarquia

A hierarquia mínima é:

1. estado e risco;
2. identificação;
3. gate;
4. próxima ação;
5. origem e temporalidade;
6. evidências;
7. metadados complementares.

A compactação remove primeiro detalhes complementares, nunca estado ou gate.

## 8. Ícones e abreviações

Ícones podem reduzir repetição visual quando acompanhados de:

- rótulo acessível;
- tooltip não exclusivo;
- legenda consistente.

Abreviações devem ser documentadas e expansíveis. Identificadores técnicos não devem ser abreviados de forma irreversível.

## 9. Densidade por contexto

| Superfície | Densidade recomendada |
|---|---|
| visão geral | padrão |
| fila operacional | padrão ou compacta |
| detalhe | confortável |
| evidências | confortável |
| histórico | padrão |
| monitoramento | compacta |
| confirmação sensível | confortável |

Confirmações sensíveis nunca usam densidade compacta.

## 10. Persistência

A preferência de densidade pode ser salva por usuário e superfície.

Ela não deve ser incorporada a:

- URLs públicas com dados sensíveis;
- projeções institucionais;
- decisões;
- eventos de domínio;
- evidências técnicas.

## 11. Atualização em tempo real

Em superfícies densas:

- novas linhas não devem deslocar o item em leitura;
- alterações relevantes devem ser destacadas;
- ordenação automática deve ser pausável;
- itens removidos devem indicar o motivo;
- o operador deve conseguir congelar a visão.

## 12. Critérios de aceitação

- todos os modos preservam estado e gate;
- a densidade não altera dados ou prioridades;
- o item selecionado permanece estável;
- confirmações sensíveis usam modo confortável;
- ícones possuem alternativa textual;
- abreviações são expansíveis;
- atualizações não deslocam silenciosamente o contexto;
- o modo compacto continua acessível por teclado e leitor de tela.
