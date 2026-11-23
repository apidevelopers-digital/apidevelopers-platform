# ChatGPT Plugins Security Policy — API Developers.digital

Status: draft  
Data: 2026-11-23

## Princípio

Nenhum plugin deve expor todas as ferramentas da instituição de uma vez. O catálogo interno pode ser completo; o catálogo do ChatGPT deve ser pequeno, por domínio, com políticas de risco.

## Classes de risco

| Risco | Exemplos | Política |
|---|---|---|
| R1 | status público, healthcheck | permitido |
| R2 | leitura operacional interna | permitido com escopo e limite |
| R3 | rascunho, dry-run, diff | permitido, sem execução real |
| R4 | envio, publicação, deploy, produção, clientes | confirmação explícita |
| R5 | DNS, exclusão, financeiro crítico, ação destrutiva | confirmação forte, backup/diff quando possível |

## Confirmação

Ações reais devem exigir confirmação explícita apropriada, por exemplo:

- `IGOR_APROVA_R4`
- `IGOR_APROVA_R5`
- `IGOR_APROVA_EXECUCAO`
- `IGOR_APROVA_VNNOX_REAL`
- confirmações específicas por domínio quando aplicável.

## Dados sensíveis

Nunca expor:

- tokens
- senhas
- app passwords
- chaves privadas
- `.env`
- bearer tokens
- strings de conexão completas
- dados pessoais/clientes além do necessário

## Padrões

- Leitura antes de escrita.
- Dry-run antes de execução real.
- Branch/PR antes de merge.
- Backup antes de alteração crítica.
- Registro no GitHub para continuidade.
