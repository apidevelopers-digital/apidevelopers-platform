# Modelo de Conteúdo do Portal

**Status:** proposta modular de interface  
**Escopo:** estrutura, hierarquia e campos de conteúdo operacional  
**Não altera:** governança, estados canônicos, autoridade, gates ou fontes de verdade

## 1. Objetivo

O modelo de conteúdo garante que cada tela explique:

- o que está sendo mostrado;
- de onde o dado veio;
- quando foi atualizado;
- qual estado operacional foi projetado;
- qual estatuto de evidência sustenta a afirmação;
- qual é a próxima ação permitida.

## 2. Entidades de conteúdo

| Entidade | Responsabilidade |
|---|---|
| Téla | contexto, objetivo, estado e ações |
| Såção | articular um grupo coerente de informações |
| Cartão | resumir uma afirmação rastreável |
| Linha de fila | identificar um item operacional |
| Alerta | comunicar risco, bloqueio, divergência ou erro |
| Evidência | sustentar uma afirmação com origem verificável |
| Aprovação | registrar proposta, autoridade, escopo e validade |
| Ação | explicar o que o operador pode fazer agora |
| Histórico | preservar eventos, decisões e mudanças |

## 3. Campos transversais

Toda afirmação operacional deve possuir ou derivar:

```text
title
summary
state
sourceRef
evidenceState
projectedAt
sourceUpdatedAt
reconciledAt
actions[]
```

Sem `sourceRef`, o conteúdo é marcado como não verificável.

## 4. Hierarquia de conteúdo

Ordem padrão de leitura:

1. estado e risco;
2. identificaçã;
3. resumo;
4. origem;
5. temporalidade;
6. evidências;
7. dependências;
8. ações permitidas;
9. metadados complementares.

A interface deve reduzir metadados antes de reduzir estado, origem ou gate.

## 5. Títulos

Títulos devem:

- identificar o objeto;
- evitar jargão;
- evitar verbos vagos;
- nao presumir sucesso;
- distinguir projeção, fonte e decisão;
- considerar o contexto do operador.

Exemplos preferidos:

- `Ativação bloqueada por evidência ausente`
- `Projeção desatualizada em 18 horas`
- `Resultado aceito pela ferramenta, ainda não verificado`

## 6. Resumos

Um resumo deve responder:

- o que mudou;
- qual o impacto;
- qual o estado atual;
- qual é a próxima ação permitida.

Resumos não substituem evidências ou detalhes auditáveis.

## 7. Estados e evidência

O conteúdo deve diferenciar:

- estado projetado;
- estado da fonte;
- estado da evidência;
- estado do gate;
- estado da ação.

Nenhum desses estados pode ser inferido apenas pela cor ou posição visual.

## 8. Conteúdo temporal

Toda informação que pode mudar deve mostrar:

- instante da fonte;
- instante da projeção;
- idade do dado;
- limiar esperado;
- estado de reconciliação;
- opção de atualizar.

## 9. Ausência de conteúdo

O modelo de conteúdo deve diferenciar:

- objeto inexistente;
- objeto nao encontrado;
- fonte nao consultada;
- fonte indisponivel;
- projecao ainda nao gerada;
- permissao insuficiente;
- filtros sem resultados.

Cada caso recebe mensagem e ação diferentes.

## 10. Conteudo de ação

Cada ação deve declarar:

- verbo;
- objeto;
- escopo;
- autoridade necessária;
- risco;
- reversibilidade;
- evidências obrigatórias;
- confirmação exigida;
- próximo estado possível.

Acções sensíveis nunca usam texto genérico como “continuar”.

## 11. Conteúdo de erro

Mensagens de erro devem conter:

- etapa afetada;
- categoria;
- impacto;
- o que permaneceu inalterado;
- retry seguro, quando existir;
- necessidade de nova aprovação;
- identificador de correlação seguro.

Evitar: “algo deu errado” sem contexto.

## 12. Conteudo de sucesso

Sucesso so deve ser exibido quando houver:

- resultado confirmado;
- evidência valida;
- escopo conhecido;
- divergencias ava