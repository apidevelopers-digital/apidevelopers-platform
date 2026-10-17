# Alexa SMAPI — leitor isolado (pré-integração)

Cliente somente leitura: lista skills de um vendor e consulta manifestos.
Sem token no GitHub, sem credenciais no código, sem escrita na Amazon.

- Endpoint oficial: `https://api.amazonalexa.com` (somente GET).
- Injete `getAccessToken()` com um acesso LWA `alexa::ask:skills:read` obtido por OAuth institucional. Ainda **não** existe no MCP.
- Autorização atual do ASK CLI no Mac **não** equivale a autorização do servidor.
- Não instala ferramenta MCP, não altera skills, não publica código nem toca ⃡dio.
- O mapeamento para as ferramentas `alexa.skills.list` e `alexa.skill.manifest` e a autorização OAuth sã fases seguintes.
- Testes simulados: `node --test test/reader.test.mjs`.

Fontes: https://developer.amazon.com/en-US/docs/alexa/smapi/skill-operations.html
e https://developer.amazon.com/en-US/docs/alexa/smapi/get-access-token-smapi.html

O código deve passar por revisão e integração com o backend MCP antes de qualquer produção.
