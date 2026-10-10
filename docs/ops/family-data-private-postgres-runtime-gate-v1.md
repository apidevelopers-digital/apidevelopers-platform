# Family Data Core v1 — gate PostgreSQL privado

**Status:** proposta operacional, sem autorizacao de execucao real.
**Autoridade:** `apidevelopers-institution/docs/FAMILY_DATA_CORE_V1.md` e `docs/FAMILY_DATA_CORE_SCHEMA_API_V1.md`.

## Evidencia em 2026-10-10

- PRs #713 a #716 mergeados; Platform Baseline CI de #716 verde no SHA `84ee5beea34a9239dbaa9e4414c3742250913aef`.
- Codigo de schema, leitura privada, HTTP/MCP e preflights em dry-run existe.
- **Pendente:** PostgreSQL privado identificado e validado; papel com privilegios minimos; schema aplicado; consulta real; integracao ponta a ponta; deploy especifico. Merge na main nao prova deploy.
- Nunca registrar servidores, usuarios, credenciais, dados familiares ou inventario privado neste repositorio publico.

## Ordem dos gates

1. **Infraestrutura:** comprovar onde reside a instancia PostgreSQL privada, proprietario, TLS, rede restrita e backups; evidencias detalhadas em registro privado. MySQL/MariaDB nao substitui PostgreSQL sem decisao arquitetural.
2. **Acesso:** papeis separados para migration e leitura; leitura somente `USAGE`/`SELECT`, sem DDL nem escrita; isolamento tenant/household negando acesso cruzado.
3. **Probe read-only:** autorizacao explicita antes de conectar; `SELECT 1` e catalogos `information_schema` para seis tabelas, colunas e tipos. Coletar somente status e contagens, nunca linhas familiares nem segredos.
4. **Schema/migration:** requer outra aprovacao, diff, backup e plano de rollback; jamais executar como efeito de probe.
5. **Teste sintetico isolado:** verificar household cruzado negado, escopo financeiro, Chef, evidencia sem `storage_ref`, limites, precisao monetaria e logs sem PII.
6. **Deploy:** aprovacao separada, SHA e CI da branch de runtime conferidos; flag desligada por padrao, smoke tests e rollback.
7. **Ingestao real:** fora deste gate. Respeitar API_STORAGE e confirmar flags de ingestao, indexacao e exposicao antes de qualquer acao.

**Decisao:** GO somente para diagnosticos sem conexao/dry-run. NO-GO para conexao, escrita, deploy e ingestao enquanto faltarem evidencias e aprovacoes explicitas.
**CI esperado:** `igor-mac-runner` / `self-hosted`, `macOS`, `X64`.
