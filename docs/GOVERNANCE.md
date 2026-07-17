# Governance

Status: Active

## Princípios

- Commits pequenos e verificados.
- PRs passam por revisão.
- Atualizações em produção sempre com plano de rollback.
- Arquitetura e documentação andam juntas.
- Nenhuma API nasce sem contrato, testes e ownership.

## Branches

- `main`: histórico estável
- `foundation/*`: estrutura da plataforma
- `feature/*`: novas capacidades
- `fix/*`: correções
- `release/*`: preparação de versão

## Sequência institucional aprovada

Durante a reancoragem da Foundation, a ordem de execução é obrigatória:

1. concluir `kernel-planning`;
2. concluir `kernel-decision`;
3. validar ambos com testes e CI;
4. somente depois avançar para Registry, envelopes e ondas seguintes.

Trabalho produzido fora dessa sequência pode ser preservado na branch, mas não deve ser tratado como integrado nem receber continuidade até o fechamento formal das etapas anteriores.

## Regra de precedência

Quando houver divergência entre documentos, históricos de conversa ou interpretações operacionais, prevalece a sequência institucional aprovada e explicitamente confirmada pelo responsável da operação.

## Estado de correção

- `kernel-planning`: prioridade ativa;
- `kernel-decision`: próxima prioridade;
- Registry e envelopes: preservados, porém temporariamente bloqueados para continuidade;
- nenhum merge, deploy ou release deve ocorrer antes da revisão da sequência.
