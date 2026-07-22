# PADRAO_OPERACIONAL_DIAGNOSTICO_CI_SEQUENCIAL_V1

## Objetivo

Padronizar a investigação e correção de falhas no CI da plataforma sem adivinhação, sem grandes reescritas e sem commits mistos.

## Regra principal

Sempre diagnosticar antes de alterar.

Cada ciclo deve produzir uma evidéncia objetiva, uma única correção e uma validação imediata.

## Fluxo obrigatório

1. Confirmar a execução mais recente do workflow.
2. Identificar a etapa exata que falhou.
3. Quando o comando agregado não mostrar a origem, criar um executor sequencial versionado.
4. Executar um arquivo ou workspace por vez.
5. Interromper na primeira falha e imprimir o alvo exato.
6. Corrigir somente a causa comprovada.
7. Fazer um commit pequeno e atômico.
8. Reexecutar o CI imediatamente.
9. Repetir até todos os checks ficarem verdes.

## Implementação atual

### Integração raiz

Executor:

```bash
node scripts/test-integration-sequentially.mjs
```

Responsabilidade:

- ordenar `tests/integration/*.test.mjs`;
- executar um teste por processo;
- falhar no primeiro arquivo quebrado;
- informar explicitamente o arquivo responsável.

### Workspaces

Executor:

```bash
node scripts/test-workspaces-sequentially.mjs
```

Responsabilidade:

- consultar os workspaces que possuem script `test`;
- executar cada workspace separadamente;
- falhar no primeiro pacote quebrado;
- informar explicitamente o workspace responsável.

## Regras de commit

- Um problema por commit.
- Não misturar diagnóstico, correção funcional e documentação.
- Não reescrever arquivos grandes quando uma alteração localizada resolve.
- Validar o commit antes de iniciar o próximo.
- Manter mensagens que descrevam exatamente a mudança.

## GitHub Actions

Para disparo manual, preferir o ID numérico do workflow quando nomes ou caminhos forem instáveis.

Platform CI:

```text
314746840
```

Exemplo operacional:

```text
workflow_id: 314746840
ref: feature/institutional-multi-agent-core-20260721
```

## Aprendizados consolidados

1. Wrappers de compatibilidade não devem executar novamente uma suíte canônica.
2. Comandos agregados podem esconder concorrência, duplicidade ou o primeiro alvo que falhou.
3. A lógica de diagnóstico deve ficar em scripts versionados; o workflow deve apenas orquestrar.
4. Um diagnóstico que não preserva o código de saída pode gerar falso positivo.
5. O executor deve usar falha imediata e propagar o exit code.
6. A próxima alteração só deve ocorrer apés leitura da evidência da execução anterior.

## Critério de conclusão 

A camada só pode ser marcada como concluída quando:

- Platform CI estiver verde;
- diagnósticos auxiliares estiverem verdes;
- não houver execução duplicada da suíte canônica;
- scripts de diagnóstico forem reproduzíveis localmente;
- o aprendizado operacional estiver versionado.

## Evidéncia de fechamento

Em 2026-07-22, a execução Platform CI `#387` concluiu com sucesso no commit:

```text
30c9740e326d79d332aedbd042747ed3172d170e
```

A execução Workspace Diagnostic correspondente também concluiu com sucesso.
