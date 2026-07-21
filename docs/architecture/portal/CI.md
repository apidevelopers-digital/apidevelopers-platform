# CI segmentada do Portal Projector

**Status:** implementada e validada  
**Fonte de verdade:** Git  
**Escrita canônica:** proibida

## Objetivo

Executar a suíte completa de `packages/portal-projector` em uma CI exclusiva, não destrutiva e acionada somente por alterações no pacote ou no próprio workflow.

## Workflow

Arquivo:

`.github/workflows/portal-projector-ci.yml`

Nome:

`Portal Projector CI`

## Segurança

- permissões limitadas a `contents: read`;
- sem credenciais próprias;
- sem escrita no Git;
- sem commit, merge, release ou deploy;
- sem instalação de dependências externas;
- Node.js 22;
- timeout de 10 minutos por job;
- cancelamento de execuções anteriores da mesma ref.

## Matriz

Cada arquivo é executado como job independente:

- `document-pipeline.test.mjs`
- `e2e-github-institutional.test.mjs`
- `git-reader.test.mjs`
- `github-provider.test.mjs`
- `index.test.mjs`
- `institutional-facade.test.mjs`
- `markdown-parser.test.mjs`
- `typed-extractor.test.mjs`
- `typed-integrity.test.mjs`

A segmentação preserva a suíte completa e torna falhas identificáveis pelo nome do arquivo.

## Gatilhos

- push em `packages/portal-projector/**`;
- push no próprio workflow;
- pull request nos mesmos caminhos;
- execução manual por `workflow_dispatch`.

## Validação

Run limpo:

- ID: `29791186598`
- SHA: `f6eae71bd30cbdeb1bd212294c84b5b8a0a885fd`
- conclusão: `success`
- matriz: 9 arquivos

## Limites

A CI não publica pacotes, não persiste projeções, não usa rede externa nos testes e não substitui auditorias gerais do repositório.
