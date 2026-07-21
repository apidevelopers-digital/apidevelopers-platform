# Snapshot de continuidade — provider GitHub do Portal

**Data:** 2026-07-21  
**Status:** IMPLEMENTAÇÃO_INICIAL_TESTADA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-github-provider-20260721`  
**HEAD inicial:** `39d75734dc6315c5a822b9c134f39353fa5359f9`

## Escopo

Foi criado um provider GitHub somente leitura, fixado por commit e compatível com o `git-reader` existente.

Nenhum arquivo de `activation-core`, `onboarding-core`, checkout, assinatura, provisionamento ou billing foi alterado.

## Microcommits

1. `71afaebf9c38c87bdb99b808eda24d1837b1ddbf` — provider GitHub somente leitura.
2. `833f33e35b0e6b26e9f82915283576063e0b2824` — testes do provider.

## Capacidades

- transporte HTTP injetado;
- requisições exclusivamente `GET`;
- commit SHA completo obrigatório;
- leitura de blobs Base64;
- listagem de árvore recursiva;
- filtro por prefixo;
- rejeição de árvore truncada;
- falhas HTTP sem vazamento de corpo;
- composição direta com `createGitCommitReader`;
- `mutationAllowed: false`.

## Testes

Comando local:

`node --test`

Resultado:

- 8 testes;
- 8 aprovados;
- 0 falhas;
- 0 cancelados;
- 0 ignorados.

## Pendências

- retry e política de rate limit;
- estratégia segura para árvores truncadas;
- integração de ponta a ponta com a fachada institucional;
- armazenamento derivado;
- API HTTP de leitura;
- workflow específico do pacote.

## Próximo passo exclusivo

Criar teste de integração de ponta a ponta entre provider GitHub, leitor, pipeline documental e fachada institucional usando transporte injetado, sem credenciais e sem escrita.
