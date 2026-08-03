# Operator Gateway - Fase B: preflight GitHub App + macOS Keychain

**Status:** especificacao de pre-ativacao; nenhuma credencial real autorizada
**Data:** 2026-08-03
**Base:** `apidevelopers-platform/main@023306e9e4906ba9cdefd8d491d47df4ada7cb9d`
**Decisao:** `ADR-0004-CREDENCIAL_E_AMBIENTE_INICIAL_OPERATOR_GATEWAY_2026-08-02.md`

## Objetivo

Definir gates auditaveis para preparar o piloto real somente leitura sem criar, armazenar, ler ou usar credencial real neste documento. Cada gate exige evidencia e aprovacao propria.

## Confirmado

- adaptador sintetico `operator-macos-keychain-vault-client.mjs` incorporado;
- API Gateway CI pos-merge `30787721294`: `success`;
- Platform Baseline CI pos-merge `30787721261`: `success`;
- runner `igor-mac-runner` com `self-hosted`, `macOS`, `X64`;
- referencia prevista: `vault://github/operator-macos-keychain/app-private-key`;
- service previsto: `digital.apidevelopers.operator-gateway`;
- account previsto: `github-app-private-key`;
- nenhuma GitHub App, chave, item Keychain, token ou chamada real existe.

## Gate 0 - capacidade administrativa por API

Antes de criar a GitHub App, o operador precisa de endpoint verificavel para:

1. criar e administrar a GitHub App institucional;
2. configurar permissoes minimas;
3. limitar repositorios;
4. gerar/rotacionar chave privada;
5. consultar/revogar instalacao;
6. produzir evidencia sanitizada sem retornar a chave.

**Bloqueio confirmado:** o conector GitHub atual nao expoe administracao de GitHub Apps.

```json
{
  "githubAppAdminApiAvailable": false,
  "credentialCreated": false,
  "keyGenerated": false,
  "installationCreated": false
}
```

## Gate 1 - GitHub App institucional

Autorizacao futura:

```text
IGOR_APROVA_CONFIGURAR_GITHUB_APP_PILOTO
```

Escopo: organizacao `apidevelopers-digital`, identidade institucional, webhooks desativados, somente leitura, zero escrita, instalacao limitada a repositorios aprovados e nenhuma chave em resposta, log ou artefato.

## Gate 2 - leitor real do macOS Keychain

Contrato:

```js
keychainReader({
  service: "digital.apidevelopers.operator-gateway",
  account: "github-app-private-key"
}) -> { bytes: Uint8Array, version?: string }
```

Requisitos:

- somente macOS;
- processo e argumentos fixos;
- sem shell ou entrada livre;
- timeout curto e saida maxima de 8192 bytes;
- stderr e erros nativos sanitizados;
- sem listagem ampla, exportacao ou fallback para `.env`, arquivo ou Actions secret;
- bytes zerados em sucesso e falha;
- execucao real desabilitada por padrao;
- testes sinteticos para item ausente, ACL negada, timeout, saida vazia e excesso de tamanho;
- CI nunca le o Keychain real.

## Gate 3 - armazenar a chave

Autorizacao futura:

```text
IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN
```

Pre-condicoes: Gate 1 verificado, leitor incorporado, runbook de rotacao/remocao aprovado, item dedicado identificado, processo autorizado definido e fingerprint publica registrada sem revelar a chave.

## Gate 4 - piloto real somente leitura

Autorizacao futura:

```text
IGOR_APROVA_PILOTO_REAL_READONLY_OPERATOR_GATEWAY
```

Escopo: workflow manual por API, SHA congelado, runner institucional, token de instalacao temporario, uma unica operacao GET allowlisted, zero escrita, limites de timeout/resposta, descarte do token, limpeza de bytes, evidencia sanitizada e rollback.

O piloto real nunca sera executado como consequencia de merge.

## Proibido

- PAT pessoal ou token permanente;
- `OPERATOR_GITHUB_TOKEN`;
- chave em `.env`, repositorio, input, comentario, log ou artefato;
- Actions secret como custodia principal;
- Hostinger compartilhada como cofre/runtime;
- execucao por push ou pull request;
- escrita ou operacao 24x7 no piloto.

## Rollback

Cancelar workflow; revogar token; suspender/remover instalacao; remover/rotacionar item Keychain; desabilitar workflow real; preservar apenas evidencia sanitizada; manter deny-by-default; registrar incidente.

## Resultado

Este documento nao cria GitHub App, chave, item Keychain, token, chamada externa, escrita, deploy, DNS, Hostinger ou producao.

Proximo passo permitido: implementar o leitor real com processo injetado e testes sinteticos, mantendo a execucao real desabilitada. A criacao da GitHub App permanece bloqueada pela ausencia de endpoint administrativo e por aprovacao separada.
