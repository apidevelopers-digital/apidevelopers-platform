# Provider GitHub somente leitura do Portal

**Status:** implementação inicial testada  
**Fonte de verdade:** Git  
**Escrita canônica:** proibida

## Objetivo

Adaptar a API de leitura do GitHub ao contrato `createGitCommitReader`, sempre fixado por SHA completo e sem expor operações de escrita.

## Interface

Subpath:

`@apidevelopers/portal-projector/github-provider`

Funções:

- `createGitHubReadOnlyPorts(options)`
- `createGitHubCommitReader(options)`

## Invariantes

- somente requisições `GET`;
- commit completo de 40 caracteres obrigatório;
- repositório no formato `owner/name`;
- leitura de conteúdo via endpoint `contents` com `ref=<sha>`;
- listagem via árvore Git recursiva fixada no mesmo SHA;
- árvores truncadas falham de forma fechada;
- respostas não Base64 são rejeitadas;
- corpos de erro não são copiados para detalhes diagnósticos;
- autenticação e transporte permanecem injetados;
- nenhum token, segredo ou credencial é armazenado;
- nenhuma função de escrita, commit, merge, exclusão ou atualização de ref é exposta.

## Limites atuais

O provider não implementa retry, cache, paginação alternativa para árvores truncadas, rate-limit coordination, persistência, autenticação própria, release ou deploy.
