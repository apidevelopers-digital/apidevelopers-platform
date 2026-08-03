# Operator Gateway — Gate 3E: pacote de provisionamento da GitHub App piloto

**Status:** preparação auditável; nenhuma GitHub App, chave, instalação, token ou item real do macOS Keychain criado  
**Data:** 2026-08-03  
**Base:** `apidevelopers-platform/main@c5208ba518e7b9a5019976d8c7541fc0efec5dc0`  
**Decisão:** `apidevelopers-institution/decisions/ADR-0004-CREDENCIAL_E_AMBIENTE_INICIAL_OPERATOR_GATEWAY_2026-08-02.md`

## Objetivo

Congelar em código uma política mínima e verificável para a futura GitHub App institucional do piloto read-only, antes de qualquer provisionamento real.

O Gate 3E não cria a App, não gera chave privada, não instala a App, não grava no Keychain, não emite token e não faz chamada externa.

## Política congelada

- organização: `apidevelopers-digital`;
- App proposta: `apidevelopers-operator-gateway-pilot`;
- webhooks: desativados;
- eventos: nenhum;
- permissões: `metadata: read` e `contents: read`;
- instalação: apenas repositórios selecionados;
- allowlist inicial:
  - `.github`;
  - `apidevelopers-institution`;
  - `apidevelopers-platform`;
- runner:
  - `self-hosted`;
  - `macOS`;
  - `X64`;
- item futuro do Keychain:
  - service: `digital.apidevelopers.operator-gateway`;
  - account: `github-app-private-key`;
  - referência opaca: `keychain://github/operator-gateway/app-private-key`.

## Artefatos

- `apps/api-gateway/staging/operator-github-app-pilot-manifest.example.json`
- `apps/api-gateway/src/operator-github-app-pilot-manifest.mjs`
- `apps/api-gateway/test/operator-github-app-pilot-manifest.test.mjs`

O validador exige modo `pre-provisioning`, flags de autorização falsas, IDs e fingerprint nulos, zero webhooks, zero escrita e allowlist exata.

Também rejeita campos com material de chave privada, PEM, token, segredo, senha ou credencial e rejeita valores com cabeçalho PEM ou prefixo de token GitHub.

## Evidência permitida após provisionamento futuro

Somente após aprovação própria, uma etapa posterior poderá registrar, sem segredo:

- App ID;
- installation ID;
- slug;
- permissões efetivas;
- repositórios instalados;
- fingerprint SHA-256 da chave pública/derivada, sem a chave privada;
- existência do item dedicado no Keychain;
- timestamps e resultado sanitizado.

A chave privada nunca poderá aparecer em commit, PR, comentário, log, artefato, saída de workflow, `.env`, GitHub Actions secret ou Hostinger.

## Bloqueio atual

O conector GitHub disponível não expõe endpoints administrativos para criar e administrar GitHub Apps. Portanto, o provisionamento real permanece bloqueado até existir um caminho administrativo verificável ou operação manual local explicitamente aprovada.

## Autorizações separadas

```text
IGOR_APROVA_CONFIGURAR_GITHUB_APP_PILOTO
IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN
IGOR_APROVA_PILOTO_REAL_READONLY_OPERATOR_GATEWAY
```

Cada autorização vale apenas para sua etapa. Merge deste pacote não consome nenhuma delas.

## Rollback futuro

- suspender ou remover a instalação;
- revogar installation tokens;
- rotacionar/remover a chave privata;
- remover o item dedicado do Keychain;
- desabilitar o workflow real;
- preservar somente evidência sanitizada;
- manter deny-by-default.

## Critério de saída

O Gate 3E estará concluído quando o manifesto, o validador e os testes estiverem incorporados à `main` com CI verde. Isso não significa que a GitHub App esteja provisionada.
