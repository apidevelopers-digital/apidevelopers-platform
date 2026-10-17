# Alexa SMAPI — adapter de leitura (desenvolvimento)

Código versionado para consulta de skills e manifestos via SMAPI; nenhuma escrita na Amazon.

- `src/index.mjs`: `createSmapiReader({getAccessToken})`, com requisições HTTPS GET.
- `src/lwa-token-provider.mjs`: `createLwaTokenProvider({getCredentials, saveRefreshToken})`, renovação LWA com cache, timeout e erro sanitizado.
- Segredos são injetados por um cofre do servidor; não há senhas nem tokens neste repositório.
- O fluxo inicial de consentimento OAuth (authorization code), cofre de segredos da VPS e registro de ferramentas no MCP **ainda não foram implementados**.
- O ASK CLI autorizado no Mac não concede acesso à VPS.
- Permissão mínima prevista: `alexa::ask:skills:read`.
- Teste: `node --test packages/alexa-smapi-adapter/test/*.test.mjs` na raiz do repositório.

## Restrições
Não efetua deploy, publicação, atualização de skills ou hospedagem de áudio. Integrar no MCP somente após validação de autenticação, origem do cofre e aprovação específica.

Referências: https://developer.amazon.com/en-US/docs/alexa/smapi/get-access-token-smapi.html
https://developer.amazon.com/en-US/docs/alexa/smapi/skill-operations.html
