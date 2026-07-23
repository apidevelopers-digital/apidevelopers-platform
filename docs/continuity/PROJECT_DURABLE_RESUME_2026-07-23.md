# Continuidade — Retomada do Project Durable Core

**Data:** 2026-07-23  
**Status:** DIAGNOSTIC_RECORDED_RUNNER_PENDING  
**Repositório:** `apidevelopers-digital/apidevelopers-platform`  
**Branch de retomada:** `work/resume-project-durable-core-20260723`  
**Base:** `ca64fde8e34bf39a6ae78821841b4dbe6123ea21`

## Objetivo

Retomar a evolução da persistência durável do domínio `project-core` sem reiniciar a arquitetura e sem misturar merge ou deploy.

## Estado encontrado

- `@apidevelopers/project-core` publica contratos síncronos e assíncronos.
- O adaptador `createDurableProjectRepository()` usa `@apidevelopers/persistence-core`.
- O repositório durável exige `store.read()` e `store.transaction()`.
- Operações de `create`, `replace`, `getById`, `getByTenantAndSlug` e `listByTenant` são assíncronas.
- O pacote declara `@apidevelopers/persistence-core` na versão `0.3.0`.

## Evidência de CI

- Workflow: `Project Core CI`
- Run disparado: `29981516310`
- SHA: `ca64fde8e34bf39a6ae78821841b4dbe6123ea21`
- Estado inicial observado: `queued`
- Runner exigido pelo workflow: `[self-hosted, macOS, X64]`

## Diagnóstico preliminar

A execução foi aceita pelo GitHub, mas não iniciou o job até o momento deste registro. Portanto:

- não há evidência de falha do código neste ciclo;
- não há evidência de falha dos testes do `project-core`;
- o bloqueio atual é de disponibilidade/agendamento do runner autohospedado ou de fila do GitHub Actions;
- este estado não deve ser classificado como falha do componente.

## Erro / bloqueio registrado

| Campo | Valor |
|---|---|
| Tipo | Infraestrutura de CI / runner pendente |
| Componente | Project Core CI |
| Impacto | Testes ainda não executados |
| Código confirmado como falho | Não |
| Merge | NÃO_EXECUTADO |
| Deploy | NÃO_EXECUTADO |

## Próximo passo exato

1. Aguardar ou diagnosticar o runner `self-hosted/macOS/X64`.
2. Reler o run `29981516310`.
3. Se o job iniciar, classificar a primeira etapa que falhar.
4. Criar correção mínima em microcommit somente se houver evidência de falha do componente.
5. Preservar separação entre falha de infraestrutura e falha de código.

## Ações não executadas

- merge;
- deploy;
- publicação;
- alteração de `main`;
- alteração de arquitetura.
