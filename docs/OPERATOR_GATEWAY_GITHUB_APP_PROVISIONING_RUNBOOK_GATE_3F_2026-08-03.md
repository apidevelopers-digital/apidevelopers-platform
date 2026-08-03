# Operator Gateway — Gate 3F: runbook de provisionamento controlado da GitHub App piloto

**Status:** preparação auditável; nenhuma GitHub App, instalação, chave privada, token ou item real do macOS Keychain criado  
**Data:** 2026-08-03  
**Base:** `apidevelopers-platform/main@df824891af978d5ba7b040c190befda5c5c62b46`  
**Autoridade:** `apidevelopers-institution/decisions/ADR-0004-CREDENCIAL_E_AMBIENTE_INICIAL_OPERATOR_GATEWAY_2026-08-02.md`

## Objetivo

Definir o procedimento operacional verificável para provisionar, em etapa futura e somente após autorização explícita, a GitHub App institucional do piloto read-only do Operator Gateway.

Este Gate 3F não executa provisionamento real. Ele separa claramente:

1. preparação e conferência;
2. criação/configuração da GitHub App;
3. geração e armazenamento da chave privada;
4. instalação restrita;
5. piloto read-only;
6. evidência sanitizada;
7. rollback.

## Pré-condições confirmáveis

Antes de qualquer execução real, conferir:

- organização alvo: `apidevelopers-digital`;
- slug proposto: `apidevelopers-operator-gateway-pilot`;
- webhooks: desativados;
- eventos: nenhum;
- permissões:
  - `metadata: read`;
  - `contents: read`;
- seleção de repositórios: `selected`;
- allowlist:
  - `.github`;
  - `apidevelopers-institution`;
  - `apidevelopers-platform`;
- runner:
  - `self-hosted`;
  - `macOS`;
  - `X64`;
- host canônico: `igor-mac-runner`;
- item futuro do Keychain:
  - service: `digital.apidevelopers.operator-gateway`;
  - account: `github-app-private-key`;
  - referência opaca: `keychain://github/operator-gateway/app-private-key`.

## Autorizações independentes

Cada etapa exige autorização própria e não reutilizável:

```text
IGOR_APROVA_CONFIGURAR_GITHUB_APP_PILOTO
IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN
IGOR_APROVA_PILOTO_REAL_READONLY_OPERATOR_GATEWAY
```

A aprovação de uma etapa não autoriza as demais.

## Fase A — Conferência segura

1. Revalidar `main`, PRs abertos, workflows e commits recentes.
2. Validar o manifesto:
   - `apps/api-gateway/staging/operator-github-app-pilot-manifest.example.json`
3. Executar:
   - `node --test apps/api-gateway/test/operator-github-app-pilot-manifest.test.mjs`
4. Confirmar que:
   - nenhuma flag de autorização está ativa;
   - IDs e fingerprint permanecem nulos;
   - nenhum segredo está presente;
   - permissões e allowlist correspondem exatamente à política.

**Saída esperada:** relatório sanitizado, sem criação ou alteração externa.

## Fase B — Configuração real da GitHub App

**Bloqueada até:** `IGOR_APROVA_CONFIGURAR_GITHUB_APP_PILOTO`

Após aprovação específica:

1. Criar a GitHub App na organização.
2. Definir o slug aprovado.
3. Manter webhooks desativados.
4. Não assinar eventos.
5. Aplicar somente `metadata: read` e `contents: read`.
6. Não conceder permissões de escrita, administração, Actions, secrets, members, deployments ou environments.
7. Registrar somente:
   - App ID;
   - slug;
   - permissões efetivas;
   - timestamp;
   - operador responsável.

**Proibido registrar:** segredo de cliente, chave privada, token ou conteúdo PEM.

## Fase C — Geração e armazenamento da chave

**Bloqueada até:** `IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN`

Após aprovação específica:

1. Gerar uma única chave privada para a GitHub App.
2. Não copiar o conteúdo para chat, issue, PR, commit, clipboard persistente, `.env`, Actions secret, Hostinger ou arquivo de projeto.
3. Encaminhar o material diretamente ao helper nativo controlado.
4. Criar o item no macOS Keychain com:
   - service exato;
   - account exato;
   - política create-only;
   - limite de 8192 bytes.
5. Confirmar apenas:
   - criação bem-sucedida;
   - fingerprint SHA-256 derivado;
   - referência opaca;
   - timestamp.
6. Descartar qualquer cópia temporária verificável.

**Nunca registrar:** chave privada, PEM, base64 do segredo ou stdout contendo material sensível.

## Fase D — Instalação restrita

Após existência confirmada da App e da chave armazenada:

1. Instalar somente na organização `apidevelopers-digital`.
2. Selecionar somente:
   - `.github`;
   - `apidevelopers-institution`;
  - `apidevelopers-platform`.
3. Conferir novamente permissões efetivas.
4. Registrar o installation ID  sem token.
5. Não ampliar repositórios sem nova decisão e autorização.

## Fase E — Piloto real read-only

**Bloqueada até:** `IGOR_APROVA_PILOTO_REAL_READONLY_OPERATOR_GATEWAY`

1. Ler a chave exclusivamente do item dedicado no Keychain.
2. Gerar JWT de curta duração.
3. Solicitar installation token temporário.
4. Executar apenas leituras permitidas:
   - metadados;
   - conteúdo de repositório;
   - branches;
   - PRs;
   - workflows e runs.
5. Não executar:
   - escrita;
   - merge;
   - dispatch;
   - comentários;
  - secrets;
   - deploy;
   - DNS;
  - Hostinger;
  - produção.
6. Sanitizar logs.
7. Revogar/expirar o token naturalmente.
8. Registrar evidência sem segredo.

## Evidência mínima aceitável

- App ID;
- installation ID;
- slug;
- permissões efetivas;
- repositórios instalados;
- fingerprint SHA-256;
- existência do item dedicado no Keychain;
- timestamps;
- IDs dos workflows de validação;
- resultado sanitizado;
- confirmação de que nenhum segredo apareceu em log.

## Critérios de abortar

Abortar imediatamente se ocorrer qualquer um destes pontos:

- permissão maior que read;
- repositório fora da allowlist;
- webhook ou evento ativo;
- segredo exibido em terminal, log, PR, commit ou chat;
- tentativa de sobrescrever item existente no Keychain;
- runner diferente de `igor-mac-runner`;
- ausência de autorização específica vigente;
- comportamento não fail-closed;
- divergência entre manifesto e configuração real.

## Rollback

1. Suspender ou remover a instalação.
2. Revogar installation tokens ativos.
3. Remover a chave privada da GitHub App.
4. Remover o item dedicado do Keychain.
5. Desabilitar qualquer workflow real.
6. Preservar apenas evidência sanitizada.
7. Registrar incidente, causa, impacto e ação corretiva.
8. Retornar ao modo deny-by-default.

## Critério de saída do Gate 3F

O Gate 3F estará concluído quando este runbook e seu checklist estiverem incorporados à `main` com CI verde.

Isso não significa que a GitHub App foi criada, instalada ou testada em operação real.
