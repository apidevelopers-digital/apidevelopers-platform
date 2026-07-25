# @apidevelopers/auth-core

Contratos de autenticação e autorização da plataforma.

## Responsabilidades

- extrair API Key de `x-api-key`, `Authorization: ApiKey` ou `Bearer`;
- comparar o segredo administrativo sem comparação direta;
- produzir identidade uniforme `{ role, principal }`;
- avaliar papéis e escopos sem executar rotas;
- autenticar API keys duráveis por tenant, prefixo e hash;
- não expor segredo nem hash na identidade autenticada.

## Autenticação durável

O adaptador `createDurableApiKeyAuthenticator` exige:

- tenant explícito, por padrão em `x-tenant-id`;
- repositório com `getActiveByPrefix(tenantId, prefix)`;
- registro ativo pertencente ao mesmo tenant;
- confirmação criptográfica do hash com `@apidevelopers/apikey-core`.

A busca é restringida pelo tenant antes da verificação da chave. O pacote não persiste credenciais e não consulta chaves globalmente.
