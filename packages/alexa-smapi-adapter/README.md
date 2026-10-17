# Alexa SMAPI — adaptador em desenvolvimento

PR #734: https://github.com/apidevelopers-digital/apidevelopers-platform/pull/734

Componentes implementados nesta branch:
- `src/index.mjs`: leitura de skills e manifestos.
- `src/lwa-token-provider.mjs`: renovacao LWA e cofre externo.
- `src/lwa-consent.mjs`: consentimento OAuth authorization_code, PKCE S256 e estado de uso unico.
- `src/mcp-bridge.mjs`: especificacao de duas ferramentas R1 (ainda nao instaladas).
- `test/*.test.mjs`: regressao HTTP simulada.
- `.github/workflows/alexa-smapi-readonly-ci.yml`: testes no runner institucional sem segredos.

Falta identificar o repositorio canonico do backend MCP Brain, criar a rota HTTPS autenticada de retorno,
cadastrar redirect_uri na Amazon, implementar cofre e estado atomico na VPS e registrar as ferramentas.
A autorizacao da conta Amazon exige consentimento real do titular. Nao copiar credenciais ASK CLI do Mac.

Escopo planejado: alexa::ask:skills:read. Nao permite publicar skill, alterar audio ou fazer deploy.
Sem merge ou implantacao sem aprovacao explicita do Igor.

Testes: node --test packages/alexa-smapi-adapter/test/*.test.mjs
