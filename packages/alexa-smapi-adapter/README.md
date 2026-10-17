# Alexa SMAPI - leitura inicial

Adaptador HTTP somente leitura para a API oficial da Amazon Alexa.
Funcoes: listar skills de um vendor e consultar manifesto por skill ID.
Sem credenciais no codigo, sem alteracoes na Amazon, sem deploy.

Requer token LWA obtido pelo servidor via OAuth; essa integracao ainda nao existe.
O token local do ASK CLI no Mac nao e uma autorizacao da VPS.

Testar: `node --test test/reader.test.mjs` (7 testes com HTTP simulado).
Proxima fase: registrar as ferramentas no MCP, implementar autorizacao OAuth e validar com a Amazon.

Documentacao: https://developer.amazon.com/en-US/docs/alexa/smapi/skill-operations.html
