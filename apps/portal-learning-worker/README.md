# Portal Learning Worker

Publica a projeção somente leitura **Memória e Melhorias** para o API Gateway.

## Fluxo

```text
memória operacional
+ grafo institucional
+ auditoria
→ kernel-memory
→ kernel-reflection
→ kernel-evolution
→ snapshot atômico
→ API Gateway
→ Portal
```

## Segurança

O worker não aprova, não executa e não altera sistemas institucionais.

```text
readOnly: true
humanApprovalRequired: true
mutationAllowed: false
executionAllowed: false
automaticApprovalAllowed: false
```

As fontes obrigatórias falham de forma fechada quando ausentes ou incompatíveis.

## Configuração

| Variável | Padrão |
|---|---|
| `PORTAL_LEARNING_MEMORY_PATH` | `./var/learning-memory.json` |
| `PORTAL_LEARNING_GRAPH_PATH` | `./var/learning-graph.json` |
| `PORTAL_LEARNING_AUDIT_PATH` | `./.audit/snapshot.json` |
| `PORTAL_LEARNING_SNAPSHOT_PATH` | `./var/portal-learning.json` |
| `PORTAL_LEARNING_INTERVAL_MS` | `300000` |
| `PORTAL_LEARNING_ONCE` | contínuo; use `1` para ciclo único |

## Verificação rápida

```bash
npm --workspace @apidevelopers/portal-learning-worker run preflight
```

O preflight confere exports, métodos e o contrato visual antes dos testes completos.

## Verificação completa

```bash
npm --workspace @apidevelopers/portal-learning-worker run check
```

Executa:

1. preflight de contratos;
2. validação sintática;
3. testes determinísticos;
4. gravação atômica;
5. leitura pelo Gateway;
6. resposta HTTP `200`;
7. contrato da tela somente leitura.

## Protocolo acelerado aprendido

1. Fixar o SHA-base no início do lote.
2. Ler exports e métodos reais antes de escrever adapters ou testes.
3. Rodar o preflight antes do primeiro push.
4. Manter um único lote coeso na mesma branch enquanto não houver conflito.
5. Falhar fechado para fonte ausente; nunca mascarar ausência com dados vazios.
6. Tratar CI verde como evidência técnica, não como autorização de merge ou deploy.
7. Registrar commit SHA e blob SHA após cada alteração.

## Execução

Ciclo único:

```bash
PORTAL_LEARNING_ONCE=1 npm --workspace @apidevelopers/portal-learning-worker start
```

Operação contínua:

```bash
npm --workspace @apidevelopers/portal-learning-worker start
```

## Operação

O modo padrão é execução sob demanda:

```bash
node scripts/apid.mjs learning
```

A política de retenção, recuperação, concorrência e diagnóstico está em:

- `docs/operations/PORTAL_LEARNING_RUNBOOK_2026-07-21.md`

Execução contínua e retenção histórica permanecem desabilitadas até decisão operacional explícita.
