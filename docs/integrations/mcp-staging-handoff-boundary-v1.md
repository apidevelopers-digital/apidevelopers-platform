# MCP staging handoff boundary v1 — laboratório isolado

**Situação:** não integrado ao runtime; não habilita rota, OAuth ou produção.
**Motivação:** preparar, no `apidevelopers-platform`, um limite entre a sessão institucional e um futuro gateway MCP de *staging*, sem reutilizar cookies entre hosts nem duplicar o emissor OAuth.

## Fonte e relação com PRs

- `apidevelopers-platform/main`: `packages/auth-core/src/browser-session-handoff.mjs`, com PKCE S256, código de uso único, persistência atômica e allowlist de origem.
- `apidevelopers-platform` PR #413 (**draft**, não incorporado): proposta de proveniência do fator de autenticação. O módulo atual não depende dessa alteração não mesclada.
- `apidevelopers-mcp-brain` PR #171 (**aberto**, não mesclado): `/oauth/authorize` bloqueia emissão de código sem `resolve_subject` fornecido pelo servidor.

## Garantias desta camada

1. `enabled` começa `false`: sem instanciar serviço, montar HTTP ou emitir código.
2. Quando ativada apenas por uma composição de laboratório, exige destino HTTPS **exato** no namespace previsto `mcp-staging[-sufixo].apidevelopers.digital`. O nome é uma proposta de contrato; **DNS e existência do staging não estão confirmados**.
3. Autentica a sessão no serviço institucional injetado (`sourceAuthenticator`). Cabeçalhos enviados pelo navegador, sem autenticação real, não constituem identidade.
4. Rejeita sessão inativa, tenant diferente e ausência de `mcp:tools:read`. Transmite apenas esse escopo; não repassa escopos administrativos nem usa a lista de escopos do cliente OAuth como autoridade de usuário.
5. Verifica autenticação **servidor-servidor** por `redeemerAuthenticator` e exige ID exato do resgatador configurado antes de consumir o código.
6. Reutiliza o `browser-session-handoff/v1`, exigindo S256 e resgate único; não mantém handoff code nem segredo raw em novo armazenamento.
7. Resultado declara explicitamente `oauthGrantsEnabled: false` e `originalAuthenticationTimeVerified: false`.
8. Nenhum código neste módulo integra `app/main`, `app/main_with_authorize`, scripts de deploy, DNS, domínio público, workflow de publicação ou sistema do Claude.

## Lacunas que impedem autenticação OAuth real

- Falta origem de staging registrada e validada por API oficial da infraestrutura.
- Falta integração do `redeemerAuthenticator` institucional em um servidor MCP de staging e credenciais mantidas no gerenciador de segredos.
- O handoff atualmente **não retorna hora de autenticação original verificável**; não preencher `auth_time` com hora do resgate ou da emissão.
- A proveniência do método humano está em PR #413, não em `main`.
- Não há fluxo consentido, de sessão e CSRF, que una `state`, PKCE e a autorização do usuário no navegador.
- A interseção entre escopos solicitados pelo cliente, escopos do usuário e política do tenant deve ser verificada antes de emitir grants em PR #171.
- Requer integração E2E com principal de teste, canários negativos e revisão antes de qualquer deploy.

## Execução e provas

Arquivo de teste: `apps/api-gateway/test/mcp-staging-handoff-boundary.test.mjs`.
Workflow exclusivo de leitura: `.github/workflows/mcp-staging-handoff-boundary-ci.yml`, runner institucional `[self-hosted, macOS, X64]`, sem segredos ou comandos de deploy.

**Escopo governado:** laboratório e PR Draft. Nenhum merge, deploy, release, publicação de endpoint, troca de DNS ou alteração de ambiente operacional.
