# Fluxos Operacionais do Portal

**Status:** proposta modular de experiência  
**Escopo:** trajetórias conceituais entre telas e estados  
**Não altera:** governança, autoridade, gates ou contratos canônicos

## 1. Princípios

Um fluxo operacional deve:

- começar em uma projeção identificável;
- preservar contexto, filtros e temporalidade;
- distinguir leitura, preparação, aprovação, execução e verificação;
- registrar bloqueios e divergências;
- terminar em estado verificável ou explicitamente indefinido.

## 2. Fluxo de investigação

```text
Visão geral
→ indicador de atenção
→ fila filtrada
→ item
→ evidências
→ origem
→ retorno ao item
```

Resultado esperado:

- causa provável identificada;
- evidências acessíveis;
- estado não alterado pela investigação;
- filtros preservados.

## 3. Fluxo de gate bloqueado

```text
Fila operacional
→ item bloqueado
→ gate
→ requisito ausente
→ evidência esperada
→ preparação permitida
→ nova reconciliação
```

O fluxo não oferece execução enquanto o gate permanecer insatisfeito.

## 4. Fluxo de divergência

```text
Alerta de divergência
→ comparação projeção/fonte
→ campos conflitantes
→ histórico
→ preparar reconciliação
→ executar reconciliação autorizada
→ verificar nova projeção
```

Caso a reconciliação não produza evidência posterior, o estado permanece divergente ou não confirmado.

## 5. Fluxo de aprovação

```text
Item
→ preparar ação
→ dry-run ou comparação
→ revisar escopo e impacto
→ solicitar aprovação
→ decisão da autoridade
→ validar revisão e validade
→ preparar execução
```

A decisão aprovada não dispara execução automaticamente.

## 6. Fluxo de execução sensível

```text
Aprovação válida
→ gates técnicos
→ confirmação exigida pela ferramenta
→ execução
→ resultado técnico
→ evidência posterior
→ projeção reconciliada
```

Possíveis finais:

- concluído e verificado;
- falhou com evidência;
- aceito pela ferramenta, ainda não verificado;
- estado remoto desconhecido;
- rollback iniciado;
- cancelado.

## 7. Fluxo de erro recuperável

```text
Falha
→ classificação
→ impacto
→ estado remoto conhecido?
→ retry seguro disponível?
→ nova tentativa
→ evidência
```

Retry não aparece quando puder duplicar efeitos ou quando o estado remoto for desconhecido.

## 8. Fluxo de atualização de projeção

```text
Tela desatualizada
→ atualizar
→ consultar fontes
→ reconciliar
→ gerar snapshot
→ comparar mudanças
→ atualizar interface
```

A interface informa fontes consultadas, fontes pendentes, instante do snapshot e mudanças observadas.

## 9. Fluxo móvel

```text
Visão geral
→ fila
→ item em tela própria
→ seção de evidências
→ ação permitida
→ retorno à mesma posição da fila
```

Nenhuma etapa depende de hover ou de painel lateral simultâneo.

## 10. Fluxo sem permissão

```text
Rota ou ação
→ validação de escopo
→ estado sem permissão
→ explicação do escopo ausente
→ retorno seguro
```

A interface não revela conteúdo protegido nem detalhes de ações que o operador não pode conhecer.

## 11. Fluxo de auditoria

```text
Item
→ histórico
→ evento
→ ator e objeto
→ decisão ou execução relacionada
→ evidências
→ origem
```

## 12. Preservação de contexto

Todos os fluxos devem preservar quando aplicável:

- branch e revisão;
- instante da projeção;
- domínio;
- filtros;
- ordenação;
- densidade;
- item selecionado;
- posição da lista;
- intervalo temporal.

## 13. Critérios de aceitação

- nenhum fluxo confunde aprovação com execução;
- execução aceita não equivale a resultado verificado;
- bloqueios explicam o requisito ausente;
- divergências mantêm os dois lados visíveis;
- retry só aparece quando seguro;
- retorno preserva o contexto;
- mobile mantém todas as etapas essenciais;
- todo final possui estado e evidência explícitos.
