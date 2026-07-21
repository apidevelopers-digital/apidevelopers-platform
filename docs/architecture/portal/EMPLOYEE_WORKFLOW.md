# Fluxo Diário do Funcionário

**Status:** proposta modular de operação  
**Escopo:** padrão de trabalho Chat + Portal  
**Não altera:** autoridade, gates ou políticas institucionais

## 1. Entrada do trabalho

O trabalho pode começar por:

- pedido de cliente;
- tarefa interna;
- alerta operacional;
- oportunidade comercial;
- incidente;
- desenvolvimento de produto;
- manutenção programada.

Toda entrada deve possuir responsável, contexto e prioridade.

## 2. Fluxo padrão

```text
receber objetivo
→ abrir contexto no Chat
→ consultar dados permitidos
→ classificar o trabalho
→ preparar plano ou artefato
→ versionar em Git quando aplicável
→ conferir no Portal
→ validar gate e autoridade
→ executar ou solicitar aprovação
→ verificar evidência
→ atualizar cliente ou equipe
→ encerrar com próximo estado
```

## 3. Tipos de trabalho

### Desenvolvimento

```text
Chat
→ especificação
→ branch
→ código e documentação
→ testes
→ conferência no Portal
→ PR ou aprovação
→ publicação governada
```

### Atendimento

```text
Chat
→ resumo do caso
→ consulta do cliente
→ diagnóstico
→ preparação de resposta ou ação
→ conferência no Portal
→ envio ou execução autorizada
→ registro do resultado
```

### Credenciais

```text
Chat
→ definição de finalidade e escopo
→ Portal
→ autenticação e autorização
→ geração no backend
→ exibição única
→ auditoria
```

### Operação técnica

```text
alerta
→ investigação no Chat
→ evidências no Portal
→ dry-run
→ aprovação quando necessária
→ execução
→ verificação posterior
```

## 4. Estados de tarefa

- recebida;
- em triagem;
- em preparação;
- aguardando informação;
- aguardando aprovação;
- pronta para execução;
- em execução;
- aguardando verificação;
- concluída;
- bloqueada;
- cancelada.

## 5. Encerramento

Uma tarefa só é concluída quando houver:

- resultado definido;
- evidência suficiente;
- cliente ou responsável atualizado, quando aplicável;
- artefatos versionados;
- pendências registradas;
- próximo passo explícito, se existir.

## 6. Regras de produtividade

- reutilizar modelos e componentes;
- automatizar tarefas repetitivas;
- evitar copiar dados entre sistemas manualmente;
- usar Chat para preparação e análise;
- usar Portal para controle e execução;
- usar Git para mudanças versionáveis;
- manter uma fila única de trabalho por pessoa;
- limitar trabalho simultâneo sem prioridade clara.

## 7. Critérios de aceitação

- toda tarefa possui contexto e responsável;
- o fluxo separa preparação de execução;
- mudanças técnicas são versionadas;
- operações sensíveis passam pelo Portal;
- conclusão exige evidência;
- bloqueios permanecem visíveis;
- o histórico permite continuidade por outro funcionário.
